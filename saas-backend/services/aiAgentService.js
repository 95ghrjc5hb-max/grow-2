import { supabase } from '../config/supabase.js';
import { callGroqChat } from './groqProvider.js';
import { searchStoreProducts } from './ragService.js';
import { safeParseAIResponse } from './safeJsonParser.js';

const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b'; 
const VISION_MODEL = 'qwen/qwen3.6-27b'; 
const VISION_CAPABLE_MODELS = new Set([VISION_MODEL]);

const UNIVERSAL_MASTER_RULE = `Universal Linguistic Adaptation & Empathy Protocol:
1. Perfect Mirroring: Automatically reply in the EXACT language used (Bangla, Banglish, English).
2. Human Tone: Talk like a highly empathetic human store manager.
3. Natural Flow: Reply directly to the context like a real ongoing conversation.`;

export const handleCustomerMessage = async ({
    customerMessage = '',
    orgId,
    storeProducts = [],
    conversationHistory = [],
    imageUrl = null,
}) => {
    try {
        const { data: botConfig } = await supabase
            .from('bot_configs')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();

        const apiKey = botConfig?.api_key?.trim().startsWith('gsk_') 
            ? botConfig.api_key.trim() 
            : process.env.GROQ_API_KEY;

        const rawMsg = customerMessage || '';
        const isImageOnly = rawMsg.includes('[Customer sent an image]') || rawMsg.trim() === '';
        const cleanMsg = isImageOnly ? '' : rawMsg.replace('[Customer sent an image]', '').trim();

        const configuredModel = botConfig?.model_name || botConfig?.model || DEFAULT_TEXT_MODEL;
        const selectedModel = imageUrl ? (VISION_CAPABLE_MODELS.has(configuredModel) ? configuredModel : VISION_MODEL) : configuredModel;

        let matchedProducts = [];
        if (!isImageOnly && cleanMsg.length > 2) {
            try {
                const ragResults = await searchStoreProducts({ orgId, query: cleanMsg });
                if (ragResults && ragResults.length > 0) matchedProducts = ragResults.slice(0, 3);
            } catch (e) {
                console.warn('[RAG WARNING] Search failed, fallback to default.');
            }
        }

        if (matchedProducts.length === 0) {
            const { data: dbProducts } = await supabase.from('products').select('*').eq('org_id', orgId).limit(3);
            matchedProducts = dbProducts || storeProducts.slice(0, 3) || [];
        }

        let inventoryContext = 'No relevant products found in store inventory.';
        if (matchedProducts.length > 0) {
            inventoryContext = matchedProducts.map((p, i) => `${i + 1}. Product: ${p.name || p.title} | Price: ৳${p.price} | Stock: ${p.stock_status || 'in_stock'} | Description: ${p.description || ''}`).join('\n');
        }

      let customSystemPrompt = botConfig?.system_prompt || "You are a professional e-commerce sales consultant.";
        if (botConfig?.restricted_topics?.length > 0) {
            customSystemPrompt += `\n\n[CRITICAL RESTRICTION]: DO NOT discuss: ${botConfig.restricted_topics.join(', ')}.`;
        }

       // 1. Base Default Required Fields
        const BASE_DEFAULT_FIELDS = [
            { id: "customer_name", label: "Full Name" },
            { id: "phone_number", label: "Phone Number" },
            { id: "delivery_address", label: "Delivery Address" },
            { id: "product_quantity", label: "Quantity" }
        ];

        // 2. Merge Base Fields with Merchant's Custom Fields
        let activeFields = [...BASE_DEFAULT_FIELDS];
        if (Array.isArray(botConfig?.order_capture_fields) && botConfig.order_capture_fields.length > 0) {
            botConfig.order_capture_fields.forEach(field => {
                const isDuplicate = activeFields.some(
                    f => f.id === field.id || f.label.toLowerCase() === field.label.toLowerCase()
                );
                if (!isDuplicate) {
                    activeFields.push(field);
                }
            });
        }

      // 🌍 Dynamic Currency & Shipping Rules Parsing
        const currency = botConfig?.currency_symbol || '$';
        const deliveryRules = Array.isArray(botConfig?.delivery_rules) && botConfig.delivery_rules.length > 0
            ? botConfig.delivery_rules
            : [{ name: "Standard Shipping", amount: 0, condition: "Default Store Delivery" }];

        const shippingRulePrompt = deliveryRules
            .map(r => `• ${r.name}: ${currency}${r.amount} (${r.condition})`)
            .join('\n');

        const requiredFieldLabels = activeFields.map(f => f.label).join(', ');
        const dynamicBulletTemplate = activeFields.map(f => `• ${f.label}`).join('\n');
        const dynamicSchemaStr = activeFields
            .map(f => `    "${f.id}": "<extracted ${f.label} or null>"`)
            .join(',\n');

        // 3. Complete Production System Prompt
        const fullSystemPrompt = `${UNIVERSAL_MASTER_RULE}

Store Personality & Role:
${customSystemPrompt}

MATCHED STORE INVENTORY:
${inventoryContext}

[STORE CURRENCY & SHIPPING RULES]
Store Currency: ${currency}
Available Delivery Zones:
${shippingRulePrompt}

[ORDER CHECKOUT REQUIREMENTS]
Active Checkout Fields:
${dynamicBulletTemplate}

[STRICT CONVERSATIONAL & SALES RULES]
1. ANTI-HALLUCINATION & INVENTORY:
   - Only discuss/sell products in the MATCHED STORE INVENTORY.
   - If a requested color/size/item is missing, state it clearly (do not hallucinate).

2. BROWSING STAGE:
   - If customer asks price/info, only answer politely. Never ask for personal details at this stage.

3. CHECKOUT & INCREMENTAL COLLECTION:
   - When customer expresses intent to buy, inspect the chat history and ask ONLY for the missing fields in clean bullet points (•).

4. SHIPPING CALCULATION:
   - Match the customer's address to the correct delivery zone.
   - Total Price = (Product Price × Quantity) + Shipping Fee.

5. FINAL ORDER CONFIRMATION & TRIGGER:
   - When the customer provides details OR says "confirm / hae confirmed kore den / yes / thik ache":
     👉 Send a celebratory order summary in "reply".
     👉 You MUST generate the complete "orderData" JSON object extracting all info from the entire chat history.
     👉 NEVER return "orderData": null once the customer has confirmed.

[RESPONSE FORMAT - STRICT JSON]
Respond ONLY with valid JSON:
{
  "reply": "Conversational reply with clean bullets (•)",
  "image_url": "<image url or null>",
  "orderData": null,
  "handover": false
}

[DYNAMIC ORDER CAPTURE PROTOCOL]
- Keep "orderData": null ONLY while missing mandatory checkout details.
- When all details are collected OR customer confirms, output:
"orderData": {
${dynamicSchemaStr},
    "product_title": "<ordered product name(s) and variants>",
    "delivery_zone": "<matched delivery zone name>",
    "delivery_charge": <applied numeric shipping fee>,
    "currency": "${currency}",
    "totalPrice": <numeric calculated total amount>
}`;

        const messages = [{ role: 'system', content: fullSystemPrompt }];

        if (Array.isArray(conversationHistory)) {
            conversationHistory.forEach((msg) => {
                const role = (msg.direction === 'incoming' || msg.sender === 'customer' || msg.role === 'user') ? 'user' : 'assistant';
                messages.push({ role, content: msg.message || msg.content });
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
                    finalImagePayload = `data:${contentType};base64,${base64Data}`;
                } catch (err) {
                    console.error('[IMAGE CONVERSION ERROR]:', err.message);
                }
            }

            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: !isImageOnly ? cleanMsg : 'Identify the product in this image and compare it with the inventory list.' },
                    { type: 'image_url', image_url: { url: finalImagePayload } }
                ]
            });
        } else {
            messages.push({ role: 'user', content: cleanMsg });
        }

        const rawResponse = await callGroqChat({ 
            messages, 
            apiKey,
            modelPriority: selectedModel,
            isVision: !!imageUrl
        });

      const parsedResponse = safeParseAIResponse(rawResponse);
        if (parsedResponse.orderData) {
            parsedResponse.image_url = null;
        }
        return parsedResponse;

    } catch (err) {
        console.error('[aiAgentService] Critical Error:', err.message);
        return { reply: 'We are experiencing high traffic, connecting you to a human.', orderData: null, image_url: null, handover: true };
    }
};

export { transcribeAudioWithGroq } from './groqProvider.js';
export { generateEmbedding } from './ragService.js';