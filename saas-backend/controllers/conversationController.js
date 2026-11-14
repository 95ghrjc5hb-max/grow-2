import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { enqueueOutboundMessage } from '../services/queueService.js';
import { checkAndIncrementMetaUsage } from '../services/usageService.js';
export const getConversations = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;

    if (!orgId) {
      return res.status(200).json({
        success: true,
        data: [],
        conversations: [],
        message: 'No active organization found'
      });
    }

    // Fetch conversations and messages strictly by organization
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (*)
      `)
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const { data: botConfig } = await supabase
      .from('bot_configs')
      .select('is_active')
      .eq('org_id', orgId)
      .limit(1)
      .maybeSingle();

    const storeAiActive = !(botConfig && botConfig.is_active === false);

    return res.status(200).json({
      success: true,
      data: conversations || [],
      conversations: conversations || [],
      store_ai_active: storeAiActive
    });

  } catch (error) {
    console.error('[UNIFIED INBOX FETCH ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// 2. Send Manual Outbound Message (Text / Image / Image + Caption) via BullMQ Queue
export const sendManualMessage = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization ID missing.' });
    }

    const {
      customerPhone,
      messageText = '',
      platform,
      conversationId,
      imageBase64 = null,
      imageMimeType = null,
    } = req.body;

    const cleanText = typeof messageText === 'string' ? messageText.trim() : '';

    if (!customerPhone || (!cleanText && !imageBase64)) {
      return res.status(400).json({
        success: false,
        error: 'Missing recipient or message content (text or image required).',
      });
    }

    // Rule 1: Caption max 1024 chars (WhatsApp limit)
    if (cleanText.length > 1024) {
      return res.status(400).json({
        success: false,
        error: 'Message/caption cannot exceed 1024 characters.',
      });
    }

    const normalizedPlatform = (platform === 'page' ? 'messenger' : platform || '').toLowerCase();
    if (!['whatsapp', 'messenger', 'instagram'].includes(normalizedPlatform)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform: ${platform}`,
      });
    }

    // 1. Fetch active integration for this org & platform
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, platform, status, is_connected')
      .eq('org_id', orgId)
      .eq('platform', normalizedPlatform)
      .limit(1)
      .maybeSingle();

    if (!integration || integration.is_connected === false || integration.status === 'disconnected') {
      return res.status(404).json({
        success: false,
        error: `No active ${normalizedPlatform} integration found.`,
      });
    }

    // 2. Rule 7: Check 24-Hour Customer Service Window before uploading or saving
    if (conversationId) {
      const { data: lastCustomerMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('org_id', orgId)
        .eq('sender', 'customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCustomerMsg?.created_at) {
        const hoursSinceLastCustomerMsg =
          (Date.now() - new Date(lastCustomerMsg.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastCustomerMsg > 24) {
          return res.status(400).json({
            success: false,
            error: '24h window expired: Customer last messaged over 24 hours ago.',
          });
        }
      }
    }

    // 3. Rule 1 & 5: Validate and upload image to Supabase Storage (if image provided)
    let uploadedImageUrl = null;
    if (imageBase64) {
      const allowedMimes = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };

      const normalizedMime = String(imageMimeType || '').toLowerCase().trim();
      if (!allowedMimes[normalizedMime]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Only JPG, PNG, and WEBP images are allowed.',
        });
      }

      const base64Clean = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Clean, 'base64');

      // Verify actual binary magic bytes (blocks disguised SVG/EXE/HTML)
      const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng =
        buffer.length > 4 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47;
      const isWebp =
        buffer.length > 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        return res.status(400).json({
          success: false,
          error: 'Security block: File binary signature is not a valid JPG, PNG, or WEBP image.',
        });
      }

      if (buffer.byteLength > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'Image exceeds the maximum 5MB file size limit.',
        });
      }

      const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
      const contentType = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
      const filePath = `${orgId}/outbound/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(filePath, buffer, { contentType, upsert: false });

      if (uploadErr) {
        console.error('[SUPABASE UPLOAD ERROR]:', uploadErr.message);
        return res.status(500).json({
          success: false,
          error: `Image upload failed: ${uploadErr.message}`,
        });
      }

      const { data: publicData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      uploadedImageUrl = publicData?.publicUrl || null;

      if (!uploadedImageUrl) {
        return res.status(500).json({
          success: false,
          error: 'Could not generate public URL for uploaded image.',
        });
      }
    }

    // 4. Rule 2: Count 1 message = 1 usage credit (Image + Caption = 1 credit, never double counted)
    try {
      const usage = await checkAndIncrementMetaUsage(orgId, customerPhone);
      if (!usage.allowed) {
        return res.status(403).json({
          success: false,
          error: `Message limit reached (${usage.reason || 'quota exceeded'}). Please upgrade your plan.`,
        });
      }
    } catch (usageErr) {
      console.warn('[MANUAL SEND USAGE WARN]:', usageErr.message);
    }

    // 5. Rule 2 & 4: Insert exactly ONE row into messages table (preserves order & history)
    const displayContent = cleanText || '[Image]';
    let savedMessage = null;

    if (conversationId) {
      const { data: insertedMsg, error: dbError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          org_id: orgId,
          sender: 'agent',
          content: displayContent,
          image_url: uploadedImageUrl,
          status: 'queued',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) throw dbError;
      savedMessage = insertedMsg;

      await supabase
        .from('conversations')
        .update({
          last_message: uploadedImageUrl && cleanText ? `📷 ${cleanText}` : uploadedImageUrl ? '📷 [Image]' : cleanText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('org_id', orgId);
    }

    // 6. Rule 3: Enqueue via BullMQ outboundWorker with senderType: 'human' (bypasses all Bot Pause guards)
    if (uploadedImageUrl) {
      const imagePayload =
        normalizedPlatform === 'whatsapp'
          ? {
              type: 'image',
              image: {
                link: uploadedImageUrl,
                ...(cleanText ? { caption: cleanText } : {}),
              },
            }
          : {
              attachment: {
                type: 'image',
                payload: { url: uploadedImageUrl, is_reusable: true },
              },
            };

      await enqueueOutboundMessage({
        platform: normalizedPlatform,
        orgId,
        integrationId: integration.id,
        recipientId: customerPhone,
        messagePayload: imagePayload,
        messageId: savedMessage?.id || null,
        conversationId: conversationId || null,
        senderType: 'human',
        priority: 1,
      });

      // Messenger/Instagram do not support text caption inside image attachment payload;
      // dispatch caption via queue without creating a 2nd DB row or 2nd credit charge
      if (cleanText && (normalizedPlatform === 'messenger' || normalizedPlatform === 'instagram')) {
        await enqueueOutboundMessage({
          platform: normalizedPlatform,
          orgId,
          integrationId: integration.id,
          recipientId: customerPhone,
          messagePayload: { text: cleanText },
          messageId: null,
          conversationId: conversationId || null,
          senderType: 'human',
          priority: 2,
          delay: 400,
        });
      }
    } else {
      const textPayload =
        normalizedPlatform === 'whatsapp'
          ? { type: 'text', text: { body: cleanText } }
          : { text: cleanText };

      await enqueueOutboundMessage({
        platform: normalizedPlatform,
        orgId,
        integrationId: integration.id,
        recipientId: customerPhone,
        messagePayload: textPayload,
        messageId: savedMessage?.id || null,
        conversationId: conversationId || null,
        senderType: 'human',
        priority: 1,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Message queued for delivery!',
      data: savedMessage,
    });
  } catch (error) {
    console.error('[MANUAL SEND ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
// 3. Toggle AI Active State
export const toggleAiState = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization ID missing.' });
    }

    const { id } = req.params;
    const { ai_active } = req.body;

    const { data, error } = await supabase
      .from('conversations')
      .update({ ai_active: ai_active })
      .eq('id', id)
      .eq('org_id', orgId)
      .select();

    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[TOGGLE AI ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
// 4. Get Overall Store AI Status (bot_configs.is_active)
export const getStorePauseStatus = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization ID missing.' });
    }

    const { data: botConfig, error } = await supabase
      .from('bot_configs')
      .select('is_active')
      .eq('org_id', orgId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const isStoreActive = !(botConfig && botConfig.is_active === false);
    return res.status(200).json({
      success: true,
      is_active: isStoreActive,
      store_ai_active: isStoreActive
    });
  } catch (error) {
    console.error('[GET STORE PAUSE ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 5. Toggle Overall Store AI State (bot_configs.is_active)
export const toggleStorePause = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization ID missing.' });
    }

    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active boolean is required.' });
    }

    const { data: existing } = await supabase
      .from('bot_configs')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: updateErr } = await supabase
        .from('bot_configs')
        .update({ is_active: is_active, updated_at: new Date().toISOString() })
        .eq('org_id', orgId);

      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('bot_configs')
        .insert({
          org_id: orgId,
          is_active: is_active,
          updated_at: new Date().toISOString()
        });

      if (insertErr) throw insertErr;
    }

    return res.status(200).json({
      success: true,
      is_active: is_active,
      store_ai_active: is_active
    });
  } catch (error) {
    console.error('[TOGGLE STORE PAUSE ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};