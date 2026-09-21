// services/aiAgentService.js

import { supabase } from '../config/supabase.js';
import { searchStoreProducts } from './ragService.js';
import { safeParseAIResponse } from './safeJsonParser.js';

import { callGroqChat } from './groqProvider.js';
import { callCerebrasChat } from './cerebrasProvider.js';
import { callGeminiChat } from './geminiProvider.js';

const UNIVERSAL_MASTER_RULE = `[GLOBAL LINGUISTIC & EMPATHY PROTOCOL]
1. Universal Language Mirroring: Instantly analyze the user's input to determine their exact language, dialect, and script. Formulate your entire response in that EXACT same language naturally. Support ALL global languages seamlessly.
2. Human Tone: Act as a highly empathetic, professional e-commerce store manager. 
3. Contextual Flow: Reply directly to the context without sounding robotic.`;

const GROQ_KEYS = [
  process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6,
  process.env.GROQ_API_KEY
].filter(Boolean);

const CEREBRAS_KEYS = [
  process.env.CEREBRAS_API_KEY_1, process.env.CEREBRAS_API_KEY_2, process.env.CEREBRAS_API_KEY_3,
  process.env.CEREBRAS_API_KEY_4, process.env.CEREBRAS_API_KEY_5, process.env.CEREBRAS_API_KEY_6,
  process.env.CEREBRAS_API_KEY
].filter(Boolean);

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4, process.env.GEMINI_API_KEY_5, process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY
].filter(Boolean);

let groqIndex = 0;
let cerebrasIndex = 0;
let geminiIndex = 0;

async function executeWaterfallEngine(messages, imageUrl = null) {
  const isVision = !!imageUrl;

  // Vision Routing: Groq Vision -> Gemini Vision
  if (isVision) {
    for (let i = 0; i < GROQ_KEYS.length; i++) {
      const apiKey = GROQ_KEYS[groqIndex];
      groqIndex = (groqIndex + 1) % GROQ_KEYS.length;
      try {
        const resp = await callGroqChat({ messages, apiKey, isVision: true });
        if (resp) return resp;
      } catch (err) { console.warn(`[Waterfall] Groq Vision Shift: ${err.message}`); }
    }

    for (let i = 0; i < GEMINI_KEYS.length; i++) {
      const apiKey = GEMINI_KEYS[geminiIndex];
      geminiIndex = (geminiIndex + 1) % GEMINI_KEYS.length;
      try {
        const resp = await callGeminiChat({ messages, apiKey });
        if (resp) return resp;
      } catch (err) { console.warn(`[Waterfall] Gemini Vision Shift: ${err.message}`); }
    }
    throw new Error("All Vision Keys & Models Exhausted.");
  }

  // Text Routing: Groq -> Cerebras -> Gemini
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const apiKey = GROQ_KEYS[groqIndex];
    groqIndex = (groqIndex + 1) % GROQ_KEYS.length;
    try {
      const resp = await callGroqChat({ messages, apiKey, isVision: false });
      if (resp) return resp;
    } catch (err) { console.warn(`[Waterfall] Groq Shift: ${err.message}`); }
  }

  for (let i = 0; i < CEREBRAS_KEYS.length; i++) {
    const apiKey = CEREBRAS_KEYS[cerebrasIndex];
    cerebrasIndex = (cerebrasIndex + 1) % CEREBRAS_KEYS.length;
    try {
      const resp = await callCerebrasChat({ messages, apiKey });
      if (resp) return resp;
    } catch (err) { console.warn(`[Waterfall] Cerebras Shift: ${err.message}`); }
  }

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const apiKey = GEMINI_KEYS[geminiIndex];
    geminiIndex = (geminiIndex + 1) % GEMINI_KEYS.length;
    try {
      const resp = await callGeminiChat({ messages, apiKey });
      if (resp) return resp;
    } catch (err) { console.warn(`[Waterfall] Gemini Shift: ${err.message}`); }
  }

  throw new Error("All 18 AI Keys and Fallback Models Exhausted.");
}

export const handleCustomerMessage = async ({
  customerMessage = '',
  orgId,
  storeProducts = [],
  conversationHistory = [],
  imageUrl = null,
}) => {
  try {
    if (!orgId) throw new Error('Tenant orgId is required for security isolation.');

    const { data: botConfig } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    let customSystemPrompt = botConfig?.system_prompt || "You are a professional e-commerce sales consultant.";
    if (botConfig?.restricted_topics?.length > 0) {
      customSystemPrompt += `\n\n[CRITICAL RESTRICTION]: DO NOT discuss: ${botConfig.restricted_topics}`;
    }

    const escalationContact = botConfig?.support_contact?.trim() || 'our support team';
    customSystemPrompt += `\n\n[GLOBAL ESCALATION PROTOCOL]
    - NEVER prematurely give out the support contact for simple inquiries, greetings, typos, or general store browsing.
    - ONLY provide the escalation contact ("${escalationContact}") and set "handover": true if:
      1. The customer explicitly asks to talk with a human, owner, or support agent.
      2. The query is completely unresolved after 3+ consecutive failed attempts.
      3. The customer reports a severe issue (order dispute, payment failure, refund).`;

    const rawMsg = customerMessage || '';
    const isImageOnly = rawMsg.includes('[Customer sent an image]') || rawMsg.trim() === '';
    const cleanMsg = isImageOnly ? '' : rawMsg.replace('[Customer sent an image]', '').trim();
    const currency = botConfig?.currency_symbol || '$';

    let matchedProducts = [];

    // 1. Enterprise Hybrid Search (Gemini Multilingual Vector + Supabase Trigram)
    if (!isImageOnly && cleanMsg.length >= 2) {
      try {
        matchedProducts = await searchStoreProducts({ orgId, query: cleanMsg, matchCount: 4 });
      } catch (e) {
        console.error('[aiAgentService] RAG search error:', e);
      }
    }

    // 2. Fallback: If completely unique or greeting query, load just top 4 products
    if (!matchedProducts || matchedProducts.length === 0) {
      const { data: fallbackProducts } = await supabase
        .from('products')
        .select('*')
        .eq('org_id', orgId)
        .limit(4);
      matchedProducts = fallbackProducts || [];
    }

    // 3. Ultra low-token inventory context
    let inventoryContext = 'No relevant products found in store inventory.';
    if (matchedProducts && matchedProducts.length > 0) {
      inventoryContext = matchedProducts.map((p, i) => {
        const title = p.name || p.title || 'Item';
        const price = p.price !== undefined && p.price !== null ? p.price : 'N/A';
        const stock = p.stock_status || 'in_stock';
        return `(${i + 1}). Product: "${title}" | Price: ${currency} ${price} | Stock: ${stock}`;
      }).join('\n');
    }

    const BASE_DEFAULT_FIELDS = [
      { id: "customer_name", label: "Full Name" },
      { id: "phone_number", label: "Phone Number" },
      { id: "delivery_address", label: "Delivery Address" },
      { id: "product_quantity", label: "Quantity" }
    ];

    let activeFields = [...BASE_DEFAULT_FIELDS];
    if (Array.isArray(botConfig?.order_capture_fields) && botConfig.order_capture_fields.length > 0) {
      botConfig.order_capture_fields.forEach(field => {
        if (!activeFields.some(f => f.id === field.id || f.label.toLowerCase() === field.label.toLowerCase())) {
          activeFields.push(field);
        }
      });
    }

    // Fixed dynamic bullet template definition
    const dynamicBulletTemplate = activeFields.map(f => `• ${f.label}`).join('\n');

    const deliveryRules = Array.isArray(botConfig?.delivery_rules) && botConfig.delivery_rules.length > 0
      ? botConfig.delivery_rules
      : [{ zone: "Standard Shipping", fee: 0, payment_type: "Default Store Delivery" }];

    // Fixed shipping rules string interpolation
    const shippingRulePrompt = deliveryRules
      .map(r => `• \({r.zone || r.name || 'Standard'}:\){currency}\({r.fee ?? r.amount ?? 0} (\){r.payment_type || r.condition || 'Standard'})`)
      .join('\n');

    // Fixed dynamic schema string
    const dynamicSchemaStr = activeFields.map(f => `"\({f.id}": "extracted\){f.label} or null"`).join(',\n    ');

    const fullSystemPrompt = `${UNIVERSAL_MASTER_RULE}

Store Personality & Role:
${customSystemPrompt}

MATCHED STORE INVENTORY:
${inventoryContext}

[STORE CURRENCY & SHIPPING RULES]
Store Currency: ${currency}
Available Delivery Zones & Fees:
${shippingRulePrompt}

[ORDER CHECKOUT REQUIREMENTS]
Active Checkout Fields:
${dynamicBulletTemplate}

[GLOBAL SALES & CONVERSATIONAL INTELLIGENCE]
1. DYNAMIC CHECKOUT GAP-FILLING & INTENT DETECTION:
   - Carefully inspect the "[ORDER CHECKOUT REQUIREMENTS]" list above (which contains all standard and custom merchant-defined fields).
   - Cross-reference the entire conversation history against this active requirements list to perform a "Gap Analysis".
   - NEVER ask the customer to repeat information they have already provided in previous messages.
   - If the customer shows buying intent, acknowledge what information is already received and politely ask ONLY for the remaining missing field(s) (the gaps) in the customer's language.
   - Adapt automatically to ANY merchant-defined custom field without hardcoded restrictions.

2. INVENTORY & STOCK RULES:
   - If an item has Stock: 'out_of_stock', politely inform the customer that it is currently unavailable and suggest in-stock alternatives. DO NOT confirm orders for out-of-stock items.
   - ABSOLUTE PRICING INTEGRITY: You MUST state ONLY the exact numerical price specified in [MATCHED STORE INVENTORY]. NEVER guess or change prices. If a product is not listed, politely state it is unavailable.
3. MULTI-ITEM & MULTI-QUANTITY HANDLING:
   - Handle single items, multiple quantities, or multiple different products seamlessly.
   - Formula: Subtotal = Sum(Product Unit Price * Quantity).

4. DYNAMIC SHIPPING & TOTAL CALCULATION:
   - Match the customer's delivery address/city against "Available Delivery Zones".
   - Formula: Total Price = Subtotal + Matched Delivery Fee.
   - Always state the breakdown clearly: Items Total + Delivery Fee = Grand Total.

5. STRICT TWO-STEP ORDER CONFIRMATION:
   - Step 1: Once all checkout details are collected, present a clean Order Summary to the customer and ask for their final confirmation (e.g., "Please reply YES/Confirm to place your order").
   - Step 2: Keep "orderData": null until the customer explicitly confirms.
   - Once confirmed, output the complete "orderData" JSON object.

[RESPONSE FORMAT - STRICT JSON]
Respond ONLY with valid JSON in this exact schema:
{
  "reply": "Conversational reply with clean formatting (* bullets)",
  "image_url": "ONLY provide product image URL if customer explicitly asks for pictures, otherwise null",
  "orderData": null,
  "handover": false
}

When the customer explicitly CONFIRMS the order, output "orderData" with exact calculated values (NO hardcoded numbers):
"orderData": {
    ${dynamicSchemaStr},
    "product_title": "Full ordered product name(s) with variant/size/color details",
    "product_quantity": "",
    "subtotal": "",
    "delivery_zone": "",
    "delivery_fee": "",
    "currency": "${currency}",
    "totalPrice": ""
}
`;

    const messages = [{ role: 'system', content: fullSystemPrompt }];

    if (Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-10);
      recentHistory.forEach((msg) => {
        const role = (msg.direction === 'incoming' || msg.sender === 'customer' || msg.role === 'user') ? 'user' : 'assistant';
        const textContent = msg.message || msg.content || '';
        if (textContent.trim()) {
          messages.push({ role, content: textContent });
        }
      });
    }

    if (imageUrl) {
      let finalImagePayload = imageUrl;
      if (imageUrl.startsWith('http')) {
        try {
          const imgResponse = await fetch(imageUrl);
          const arrayBuffer = await imgResponse.arrayBuffer();
          const base64Data = Buffer.from(arrayBuffer).toString('base64');
          const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
          finalImagePayload = `data:\({contentType};base64,\){base64Data}`;
        } catch (err) {
          console.error('[IMAGE CONVERSION ERROR]:', err.message);
        }
      }

      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: cleanMsg || 'Identify the product in this image and compare with inventory.' },
          { type: 'image_url', image_url: { url: finalImagePayload } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: cleanMsg || 'Hello' });
    }

    const rawResponse = await executeWaterfallEngine(messages, imageUrl);
    const parsedResponse = safeParseAIResponse(rawResponse);
    
    if (parsedResponse?.orderData) {
      parsedResponse.image_url = null;
    }

    return parsedResponse;
  } catch (err) {
    console.error('🔴 [aiAgentService] Critical Error:', err.message);
    return {
      reply: 'We are experiencing high traffic, connecting you to human support.',
      orderData: null,
      image_url: null,
      handover: true
    };
  }
};

export { transcribeAudioWithGroq } from './groqProvider.js';
export { generateEmbedding } from './ragService.js';