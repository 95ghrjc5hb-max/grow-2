const FALLBACK_RESPONSE = Object.freeze({
  reply: "Thank you for reaching out. We are currently looking into this, and a customer support representative will assist you shortly.",
  orderData: null,
  image_url: null,
  handover: true
});

const REQUIRED_ORDER_FIELDS = ['customerName', 'phone', 'address', 'products', 'totalPrice'];

function tryParse(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function normalize(obj) {
  if (!obj || typeof obj !== 'object') {
    return { ...FALLBACK_RESPONSE };
  }

 let orderData = null;
  if (obj.orderData && typeof obj.orderData === 'object' && !Array.isArray(obj.orderData)) {
    orderData = obj.orderData;
  }

  return {
    reply: typeof obj.reply === 'string' && obj.reply.trim() ? obj.reply.trim() : FALLBACK_RESPONSE.reply,
    image_url: typeof obj.image_url === 'string' && obj.image_url.trim() ? obj.image_url.trim() : null,
    orderData: orderData,
    handover: typeof obj.handover === 'boolean' ? obj.handover : false
  };
}

export function safeParseAIResponse(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { ...FALLBACK_RESPONSE };
  }

  const trimmed = rawContent.trim();

  // Step 1: Direct JSON parse
  const direct = tryParse(trimmed);
  if (direct) return normalize(direct);

  // Step 2: Extract substring if AI wraps JSON in markdown
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substring = trimmed.slice(firstBrace, lastBrace + 1);
    const extracted = tryParse(substring);
    if (extracted) return normalize(extracted);
  }

  // Step 3: Total Failure Fallback
  return {
    reply: trimmed.slice(0, 2000),
    orderData: null,
    image_url: null,
    handover: false
  };
}