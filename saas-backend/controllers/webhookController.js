import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { enqueueInboundEvent } from '../services/queueService.js';

// ─── 1. VERIFY (GET) ───
export const verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    console.log('[WEBHOOK VERIFIED]');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};
export const verifyWebhook = verifyMetaWebhook;

// ─── 2. HMAC — Dual secret, Gemini er valo dik ta rakhlam ───
function verifyHmacSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || typeof signature !== 'string') return false;
  const parts = signature.split('=');
  const signatureHash = parts[1];
  if (!signatureHash) return false;
  const secrets = [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET].filter(Boolean);
  if (secrets.length === 0) return false;
  const rawPayload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const sigBuf = Buffer.from(signatureHash, 'utf8');
  for (const secret of secrets) {
    const expectedHash = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
    const expBuf = Buffer.from(expectedHash, 'utf8');
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) return true;
  }
  return false;
}

// ─── 3. DEDUP — insert age, kintu enqueue fail hole delete kore dibo ───
async function checkAndMarkProcessed(mid) {
  if (!mid) return false;
  const cleanMid = String(mid);
  try {
    const { data } = await supabase.from('processed_webhooks').select('mid').eq('mid', cleanMid).maybeSingle();
    if (data) return true;
    const { error } = await supabase.from('processed_webhooks').insert({ mid: cleanMid });
    if (error) {
      if (error.code === '23505') return true;
      console.error('[DEDUP WARN]:', error.message);
      return false;
    }
    return false;
  } catch (e) {
    console.error('[DEDUP ERROR]:', e.message);
    return false;
  }
}
async function unmarkProcessed(mid) {
  if (!mid) return;
  try { await supabase.from('processed_webhooks').delete().eq('mid', String(mid)); } catch {}
}

// ─── 4. INTEGRATION LOOKUP — account_id query bad dilam, shudhu page_id + credentials ───
function getNestedValue(integration, keys) {
  if (!integration) return null;
  for (const k of keys) {
    if (integration[k] !== undefined && integration[k] !== null && integration[k] !== '') return String(integration[k]);
  }
  const creds = integration.credentials || {};
  for (const k of keys) {
    if (creds[k] !== undefined && creds[k] !== null && creds[k] !== '') return String(creds[k]);
  }
  return null;
}
function isActive(integration) {
  if (!integration) return false;
  if (integration.is_connected === false) return false;
  if (integration.status === 'disconnected' || integration.status === 'needs_reauth') return false;
  return true;
}
async function findIntegration(platform, candidateIds = []) {
  const validIds = [...new Set(candidateIds.filter(Boolean).map(String))];
  if (validIds.length === 0) return null;
  for (const candidateId of validIds) {
    const { data: byPage } = await supabase.from('integrations').select('*').eq('platform', platform).eq('page_id', candidateId).limit(1).maybeSingle();
    if (isActive(byPage)) return byPage;
    // account_id column DB te nai, tai query korbo na — agei bug chilo
  }
  const { data: list } = await supabase.from('integrations').select('*').eq('platform', platform);
  if (Array.isArray(list)) {
    for (const integ of list) {
      if (!isActive(integ)) continue;
      const phoneId = getNestedValue(integ, ['phone_number_id', 'phoneNumberId']);
      const igId = getNestedValue(integ, ['ig_user_id', 'igUserId', 'instagram_id', 'instagramId']);
      const pageId = getNestedValue(integ, ['page_id', 'pageId']);
      if ((phoneId && validIds.includes(phoneId)) || (igId && validIds.includes(igId)) || (pageId && validIds.includes(pageId))) return integ;
    }
  }
  return null;
}
// Page object hole messenger + instagram 2 tai try koro — Gemini er vul fix
async function findIntegrationForPageObject(candidateIds) {
  let integ = await findIntegration('messenger', candidateIds);
  if (integ) return integ;
  integ = await findIntegration('instagram', candidateIds);
  if (integ) return integ;
  return null;
}

// ─── 5. MAIN HANDLER — THIN, 200 agei ───
export const handleMetaWebhook = async (req, res) => {
  if (!req.headers['x-hub-signature-256']) return res.status(401).json({ error: 'Missing x-hub-signature-256' });
  if (!verifyHmacSignature(req)) return res.status(403).json({ error: 'Invalid HMAC signature' });
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;
  if (!body || typeof body !== 'object') return;
  try {
    // A. WHATSAPP
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        const wabaId = entry.id;
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          const value = change.value || {};
          const phoneNumberId = value.metadata?.phone_number_id;
          if (Array.isArray(value.statuses)) {
            for (const st of value.statuses) {
              if (st.id && st.status) {
                const patch = { status: st.status };
                if (st.status === 'failed' && st.errors?.[0]) patch.error = st.errors[0].title || st.errors[0].message || 'WhatsApp delivery failed';
                await supabase.from('messages').update(patch).eq('platform_message_id', st.id);
              }
            }
          }
          const messages = value.messages;
          if (!Array.isArray(messages) || messages.length === 0) continue;
          for (const msg of messages) {
            const platformMessageId = msg.id || null;
            if (await checkAndMarkProcessed(platformMessageId)) continue;
            const senderId = msg.from;
            if (!senderId) { await unmarkProcessed(platformMessageId); continue; }
            const contactName = value.contacts?.find((c) => c.wa_id === senderId)?.profile?.name || `+${senderId}`;
            let messageText = '';
            let imageUrl = null;
            let audioMediaId = null;
            let audioUrl = null;
            if (msg.type === 'text') messageText = msg.text?.body || '';
            else if (msg.type === 'audio' || msg.type === 'voice') audioMediaId = msg.audio?.id || msg.voice?.id || null;
            else if (msg.type === 'image') { messageText = msg.image?.caption || '[Image]'; imageUrl = msg.image?.link || null; }
            else if (msg.type === 'video') messageText = msg.video?.caption || '[Video]';
            else if (msg.type === 'document') messageText = msg.document?.caption || '[Document]';
            else if (msg.type === 'location') messageText = `[Location] ${msg.location?.latitude},${msg.location?.longitude}`;
            else if (msg.type === 'contacts') messageText = '[Contact shared]';
            else if (msg.type === 'sticker') messageText = '[Sticker]';
            else if (msg.type === 'button') messageText = msg.button?.text || msg.button?.payload || '';
            else if (msg.type === 'interactive') {
              const inter = msg.interactive || {};
              messageText = inter.button_reply?.title || inter.list_reply?.title || inter.button_reply?.id || inter.list_reply?.id || '[Interactive]';
            } else messageText = `[${msg.type || 'message'}]`;
            if (!messageText && !audioMediaId && !imageUrl) { await unmarkProcessed(platformMessageId); continue; }
            const integration = await findIntegration('whatsapp', [phoneNumberId, wabaId]);
            if (!integration) { console.warn(`[DROPPED] No WhatsApp integration for ${phoneNumberId}`); await unmarkProcessed(platformMessageId); continue; }
            try {
              await enqueueInboundEvent({ platform: 'whatsapp', orgId: integration.org_id, integrationId: integration.id, senderId, customerName: contactName, messageText, imageUrl, audioUrl, audioMediaId, platformMessageId, rawEvent: { entryId: entry.id, field: change.field } });
            } catch (e) {
              console.error('[ENQUEUE FAIL] WhatsApp, unmarking for retry:', e.message);
              await unmarkProcessed(platformMessageId);
            }
          }
        }
      }
      return;
    }
    // B. MESSENGER / INSTAGRAM
    if (body.object === 'page' || body.object === 'instagram') {
      const isInstagramObject = body.object === 'instagram';
      for (const entry of body.entry || []) {
        const entryId = entry.id;
        let events = [];
        if (Array.isArray(entry.messaging)) events = entry.messaging;
        else if (Array.isArray(entry.changes)) events = entry.changes.filter((c) => c.field === 'messages' && c.value).map((c) => c.value);
        if (events.length === 0) continue;
        for (const evt of events) {
          if (evt.message?.is_echo) continue;
          if (!evt.message && !evt.postback) continue;
          const platformMessageId = evt.message?.mid || evt.postback?.mid || null;
          if (platformMessageId && (await checkAndMarkProcessed(platformMessageId))) continue;
          const senderId = evt.sender?.id;
          const recipientId = evt.recipient?.id;
          if (!senderId) { await unmarkProcessed(platformMessageId); continue; }
          let messageText = evt.message?.text || evt.postback?.title || evt.postback?.payload || evt.message?.quick_reply?.payload || '';
          const attachments = Array.isArray(evt.message?.attachments) ? evt.message.attachments : [];
          const imageAtt = attachments.find((a) => a.type === 'image');
          const imageUrl = imageAtt?.payload?.url || null;
          const audioAtt = attachments.find((a) => a.type === 'audio');
          const audioUrl = audioAtt?.payload?.url || null;
          const videoAtt = attachments.find((a) => a.type === 'video');
          if (!messageText && !imageUrl && !audioUrl && !videoAtt) { if (attachments.length > 0) messageText = `[${attachments[0].type}]`; else { await unmarkProcessed(platformMessageId); continue; } }
          if (videoAtt && !messageText) messageText = '[Video]';
          let integration = null;
          let targetPlatform = 'messenger';
          if (isInstagramObject) {
            integration = await findIntegration('instagram', [recipientId, entryId]);
            targetPlatform = 'instagram';
          } else {
            integration = await findIntegrationForPageObject([recipientId, entryId]);
            if (integration) targetPlatform = integration.platform;
          }
          if (!integration) { console.warn(`[DROPPED] No integration for recipient=${recipientId} entry=${entryId}`); await unmarkProcessed(platformMessageId); continue; }
          const displayName = senderId;
          try {
            await enqueueInboundEvent({ platform: targetPlatform, orgId: integration.org_id, integrationId: integration.id, senderId, customerName: displayName, messageText, imageUrl, audioUrl, audioMediaId: null, platformMessageId, rawEvent: { entryId } });
          } catch (e) {
            console.error('[ENQUEUE FAIL] Messenger/IG, unmarking:', e.message);
            await unmarkProcessed(platformMessageId);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WEBHOOK CONTROLLER ERROR]:', err.message);
  }
};
export const handleWebhook = handleMetaWebhook;

// ─── 6. GDPR ───
export const handleCustomerDataRequest = async (req, res) => {
  try { console.log(`[GDPR] Customer data request for ${req.body?.customer?.email || 'Customer'}`); return res.status(200).json({ success: true }); } catch { return res.status(200).send('OK'); }
};
export const handleCustomerRedact = async (req, res) => {
  try { console.log(`[GDPR] Customer redact for ${req.body?.customer?.email || 'Customer'}`); return res.status(200).json({ success: true }); } catch { return res.status(200).send('OK'); }
};
export const handleShopRedact = async (req, res) => {
  try {
    const shopDomain = req.body?.shop_domain || req.body?.shopDomain || '';
    console.log(`[GDPR] Shop redact for ${shopDomain}`);
    // page_id diye shop_domain khujbo na — vul chilo. credentials e khuji.
    if (shopDomain) {
      const { data: list } = await supabase.from('integrations').select('*');
      for (const integ of list || []) {
        const credShop = integ.credentials?.shop_domain || integ.credentials?.shopDomain || integ.credentials?.shop || '';
        if (credShop && String(credShop).includes(shopDomain)) {
          await supabase.from('integrations').update({ status: 'disconnected', is_connected: false }).eq('id', integ.id);
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (e) { console.error('[GDPR Error] Shop Redact:', e.message); return res.status(200).send('OK'); }
};