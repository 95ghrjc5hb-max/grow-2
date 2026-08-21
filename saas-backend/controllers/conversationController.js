import { supabase } from '../config/supabase.js';
import { sendMetaReply, sendWhatsAppReply } from '../services/metaGraphService.js';

export const getConversations = async (req, res) => {
  try {
    // Extract the ID from the token payload (saved as 'userid' in server.js auth route)
    const orgId = req.user?.userid || req.user?.id;

    if (!orgId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized: Missing User ID in token.' 
      });
    }

    // Fetch conversations and their associated messages from Supabase securely
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (*)
      `)
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: conversations || []
    });

  } catch (error) {
    console.error('[UNIFIED INBOX FETCH ERROR]:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// 2. Send Manual Outbound Message from Unified Inbox Dashboard
export const sendManualMessage = async (req, res) => {
  try {
    const orgId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.org_id;
    
    // Added conversationId to match Supabase schema
    const { customerPhone, messageText, platform, conversationId } = req.body;

    if (!customerPhone || !messageText) {
      return res.status(400).json({ success: false, error: 'Missing recipient or message text.' });
    }

    const normalizedPlatform = platform === 'page' ? 'messenger' : platform;

    // 1. Fetch target integration credentials
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('platform', normalizedPlatform)
      .limit(1)
      .maybeSingle();

    if (!integration) {
      return res.status(404).json({ success: false, error: `No active ${normalizedPlatform} integration found.` });
    }

    // 2. Dispatch message via platform API
    if (normalizedPlatform === 'messenger' || normalizedPlatform === 'instagram') {
      await sendMetaReply(integration.access_token, integration.page_id, customerPhone, messageText);
    } else if (normalizedPlatform === 'whatsapp') {
      const activePhoneId = integration.page_id;
      await sendWhatsAppReply(integration.access_token, activePhoneId, customerPhone, messageText);
    }

    // 3. Save manual agent message to Supabase
    if (conversationId) {
        const { error: dbError } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender: 'agent',
            content: messageText,
            created_at: new Date()
        });

        if (dbError) throw dbError;

        // 4. Update the last message in the conversations table
        await supabase.from('conversations')
            .update({ 
                last_message: messageText, 
                updated_at: new Date() 
            })
            .eq('id', conversationId);
    }

    return res.status(200).json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('[MANUAL SEND ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. Toggle AI Active State
export const toggleAiState = async (req, res) => {
  try {
    const { id } = req.params;
    const { ai_active } = req.body;

    const { data, error } = await supabase
      .from('conversations')
      .update({ ai_active: ai_active })
      .eq('id', id)
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