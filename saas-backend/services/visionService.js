import { supabase } from '../config/supabase.js';
import { callGroqChat } from './groqProvider.js';
import { searchStoreProducts } from './ragService.js';
import { safeParseAIResponse } from './safeJsonParser.js';
// 🚨 Bye Bye Gemini! We rely 100% on Groq Vision now!

const DEFAULT_TEXT_MODEL = 'llama-3.3-70b-versatile'; 
const VISION_MODEL = 'llama-3.2-11b-vision-preview'; 
const VISION_CAPABLE_MODELS = new Set([VISION_MODEL, 'llama-3.2-90b-vision-preview']);

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
        // 1. Fetch Config
        const { data: botConfig } = await supabase
            .from('bot_configs')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();

        const apiKey = botConfig?.api_key?.trim().startsWith('gsk_') 
            ? botConfig.api_key.trim() 
            : process.env.GROQ_API_KEY;

        // 2. Clean Webhook Dirty Payload
        const rawMsg = customerMessage || '';
        const isImageOnly = rawMsg.includes('[Customer sent an image]') || rawMsg.trim() === '';
        const cleanMsg = isImageOnly ? '' : rawMsg.replace('[Customer sent an image]', '').trim();

        // 3. Model Routing
        const configuredModel = botConfig?.model_name || botConfig?.model || DEFAULT_TEXT_MODEL;
        const selectedModel = imageUrl ? (VISION_CAPABLE_MODELS.has(configuredModel) ? configuredModel : VISION_MODEL) : configuredModel;

        // 4. Vector Database Search (RAG) - Only if there is text
        let matchedProducts = [];
        if (!isImageOnly && cleanMsg.length > 2) {
            try {
                const ragResults = await searchStoreProducts({ orgId, query: cleanMsg });
                if (ragResults && ragResults.length > 0) matchedProducts = ragResults.slice(0, 3);
            } catch (e) {
                console.warn('[RAG WARNING] Search failed, fallback to default.');
            }
        }

        // Fallback: Generic Store Products
        if (matchedProducts.length === 0) {
            const { data: dbProducts } = await supabase.from('products').select('*').eq('org_id', orgId).limit(3);
            matchedProducts = dbProducts || storeProducts.slice(0, 3) || [];
        }

        // 5. Build Inventory Context
        let inventoryContext = 'No relevant products found in store inventory.';
        if (matchedProducts.length > 0) {
            inventoryContext = matchedProducts.map((p, i) => `${i + 1}. Product: ${p.title || p.name} | Price: ৳${p.price} | Stock: ${p.stock_status || 'In Stock'} | Details: ${p.description || 'N/A'} | URL: ${p.image_url || 'null'}`).join('\n');
        }

        let customSystemPrompt = botConfig?.system_prompt || "You are a helpful customer support AI agent for an e-commerce store.";
        if (botConfig?.restricted_topics?.length > 0) {
            customSystemPrompt += `\n\n[CRITICAL RESTRICTION]: DO NOT discuss: ${botConfig.restricted_topics.join(', ')}.`;
        }

        const fullSystemPrompt = `${UNIVERSAL_MASTER_RULE}\n\nStore Personality:\n${customSystemPrompt}\n\nMATCHED STORE INVENTORY (Use ONLY these facts):\n${inventoryContext}

[RESPONSE FORMAT - STRICT JSON]
You MUST respond with ONLY a valid JSON object. Structure:
{
  "reply": "Your conversational reply.",
  "image_url": "Product image URL if recommending, else null.",
  "orderData": null,
  "handover": false
}

🚨 CRITICAL ORDER LOGIC:
Set "orderData" to null for normal messages. ONLY when customer confirms order, structure:
"orderData": {
  "customerName": "<name>", "phone": "<phone>", "address": "<address>", "products": "<products>", "totalPrice": <number>
}
If any required field is missing, ask for it in "reply" and set "orderData" to null.`;

        const messages = [{ role: 'system', content: fullSystemPrompt }];

        // Chat History
        if (Array.isArray(conversationHistory)) {
            conversationHistory.forEach((msg) => {
                const role = (msg.direction === 'incoming' || msg.sender === 'customer' || msg.role === 'user') ? 'user' : 'assistant';
                messages.push({ role, content: msg.message || msg.content });
            });
        }

        // 🚀 6. MULTIMODAL INJECTION FOR GROQ VISION!
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

        // 7. Call Groq
        const rawResponse = await callGroqChat({ 
            messages, 
            apiKey,
            modelPriority: selectedModel,
            isVision: !!imageUrl // 🚨 Triggers Vision Model Priority!
        });

        return safeParseAIResponse(rawResponse);

    } catch (err) {
        console.error('[aiAgentService] Critical Error:', err.message);
        return { reply: 'We are experiencing high traffic, connecting you to a human.', orderData: null, image_url: null, handover: true };
    }
};

// 🚨 RE-EXPORTS (Prevents Webhook crash)
export { transcribeAudioWithGroq } from './groqProvider.js';
export { generateEmbedding } from './ragService.js';