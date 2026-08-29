import { pipeline } from '@xenova/transformers';
import { supabase } from '../config/supabase.js';
import Groq from 'groq-sdk';
// 🎙️ GLOBAL MULTILINGUAL AUDIO TRANSCRIPTION (Auto-Detects Any Language)
export const transcribeAudioWithGroq = async (audioUrl) => {
    try {
        if (!audioUrl) return null;

        // 1. Download the voice note audio from Meta CDN
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`);
        
        const contentType = response.headers.get('content-type') || 'audio/m4a';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Determine file extension properly
        let fileExt = 'm4a';
        if (contentType.includes('ogg')) fileExt = 'ogg';
        else if (contentType.includes('mp4') || contentType.includes('m4a')) fileExt = 'm4a';
        else if (contentType.includes('wav')) fileExt = 'wav';
        else if (contentType.includes('mp3') || contentType.includes('mpeg')) fileExt = 'mp3';

        // 2. Prepare Form Data for Groq Whisper
        const formData = new FormData();
        const blob = new Blob([buffer], { type: contentType });
        formData.append('file', blob, `audio_input.${fileExt}`);
        
        // Use whisper-large-v3 for maximum multilingual support globally
        formData.append('model', 'whisper-large-v3');
        
        // 🔥 MAGIC: No 'language' or 'prompt' passed! 
        // Whisper will automatically detect if it's Spanish, Arabic, Hindi, Bengali, etc.

        // 3. Call Groq Whisper API
        const apiKey = process.env.GROQ_API_KEY;
        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        const result = await groqRes.json();
        
        if (result && result.text && result.text.trim()) {
            console.log('🎙️ [GLOBAL AUDIO TRANSCRIBED]:', result.text.trim());
            return result.text.trim();
        } else {
            console.warn('⚠️ [GROQ TRANSCRIBE]: No text returned', result);
            return null;
        }
    } catch (err) {
        console.error('[GROQ TRANSCRIBE ERROR]:', err.message);
        return null;
    }
};
const UNIVERSAL_MASTER_RULE = `Universal Linguistic Adaptation & Empathy Protocol:
1. Perfect Mirroring: Automatically reply in the EXACT natural language, regional dialect, and script the customer used.
2. Ultra-Smooth Human Tone: NEVER sound like a robot or a rigid AI. Talk like a highly empathetic, friendly, and professional human store manager. Use smooth, conversational phrasing.
3. Context & Emotion Reading: Customer inputs might be transcribed voice messages (raw, messy, or short). Analyze the hidden emotion. If they sound confused, be extremely polite and helpful. If they sound quick/hurried, give a fast, direct answer. 
4. Natural Flow: Avoid generic greetings in every single message like "Hello! How can I assist?". Reply directly to the context like a real ongoing human conversation.`;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let extractor = null;

// Groq's model lineup churns fast (they deprecate models with ~30-90 days notice).
// Keeping these as named constants means a future migration is a one-line change,
// not a find-and-replace across the file.
const DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b'; // replaces deprecated llama-3.1-8b-instant
const VISION_MODEL = 'qwen/qwen3.6-27b'; // current Groq multimodal model (image + text, JSON mode, tool use)

// Only models known to accept image_url content blocks on Groq. If a store's
// configured `bot_configs.model` isn't vision-capable, we force-override to
// VISION_MODEL for image messages rather than letting the API call 400.
const VISION_CAPABLE_MODELS = new Set([VISION_MODEL]);

export const getExtractor = async () => {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
};

export const generateEmbedding = async (text) => {
  const pipe = await getExtractor();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
};

/**
 * Safely parses the model's JSON output.
 * Even with response_format: 'json_object', a model can still return content
 * that fails strict JSON.parse (e.g. truncated output if max_completion_tokens
 * is hit mid-object). This never throws — it always returns a usable shape.
 */
const safeParseAIResponse = (rawContent) => {
    const fallback = {
        reply: 'Sorry, I could not process your request. Could you please rephrase that?',
        orderData: null,
        image_url: null
    };

    if (!rawContent || typeof rawContent !== 'string') return fallback;

    const tryParse = (str) => {
        try {
            const parsed = JSON.parse(str);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return null;
        } catch (e) {
            return null;
        }
    };

    // Attempt 1: direct parse (expected path when JSON mode behaves).
    let parsed = tryParse(rawContent.trim());

    // Attempt 2: model wrapped JSON in markdown fences or added stray prose
    if (!parsed) {
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            parsed = tryParse(rawContent.slice(firstBrace, lastBrace + 1));
        }
    }

    // Attempt 3: total failure - treat the raw text as the reply
    if (!parsed) {
        return { reply: rawContent.trim().slice(0, 2000), orderData: null, image_url: null };
    }

   const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
        ? parsed.reply.trim()
        : fallback.reply;

    // MAGIC: Capture the image URL from AI!
    const image_url = typeof parsed.image_url === 'string' && parsed.image_url.trim()
        ? parsed.image_url.trim()
        : fallback.image_url;

    // orderData logic
    let orderData = parsed.orderData && typeof parsed.orderData === 'object' && !Array.isArray(parsed.orderData)
        ? parsed.orderData
        : null;
        
  return { reply, orderData, image_url, handover };
};

export const handleCustomerMessage = async ({
  customerMessage,
  orgId,
  storeProducts,
  conversationHistory,
  imageUrl = null,
}) => {
  try {
  
        
   // 1. Fetch Store Owner's Personal Bot Config (Single Clean Fetch)
    const { data: botConfig } = await supabase
        .from('bot_configs')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

   // 1.5 Fetch System Prompt & Handle Restricted Topics 🔥
    let customSystemPrompt = botConfig?.system_prompt || "You are a helpful customer support AI agent for an e-commerce store.";
    
    // Add Restricted Topics dynamically to the AI's brain if they exist
    const restrictedTopics = botConfig?.restricted_topics;
    if (restrictedTopics && Array.isArray(restrictedTopics) && restrictedTopics.length > 0) {
        customSystemPrompt += `\n\n[CRITICAL RESTRICTION]: You MUST NOT answer questions, give advice, or discuss the following topics under ANY circumstances: ${restrictedTopics.join(', ')}. If the user asks about these topics, politely refuse and state that you can only assist with store-related inquiries. Offer human handover if they insist.`;
    }

    // BULLETPROOF API KEY FALLBACK LOGIC
    let activeGroq = groq; // Default to the global central client defined at the top
    try {
        // Use custom store owner API key ONLY if it is a valid non-empty string starting with 'gsk_'
        if (botConfig && botConfig.api_key && typeof botConfig.api_key === 'string' && botConfig.api_key.trim().startsWith('gsk_')) {
            activeGroq = new Groq({ apiKey: botConfig.api_key.trim() });
            console.log(`[AI SERVICE] Using custom store owner API key for org: ${orgId}`);
        } else {
            console.log(`[AI SERVICE] Using global central .env API key for org: ${orgId}`);
        }
    } catch (error) {
        console.log('[AI SERVICE] Fallback if any exception occurs');
        activeGroq = groq;
    }

    // 🚀 FIXED: Read 'model_name' correctly from Supabase
    const configuredModel = botConfig?.model_name || botConfig?.model || DEFAULT_TEXT_MODEL;
    
    // Route to a vision-capable model whenever an image is present
    const selectedModel = imageUrl 
        ? (VISION_CAPABLE_MODELS.has(configuredModel) ? configuredModel : VISION_MODEL) 
        : configuredModel;

    if (imageUrl && selectedModel !== configuredModel) {
        console.log(`[MODEL OVERRIDE]: org ${orgId} configured ${configuredModel} (not vision-capable) -> using ${selectedModel}`);
    }
    // Route to a vision-capable model whenever an image is present, regardless
    // of what the org configured — a text-only model will reject image content.
    

    // 2. Format Inventory Context (Using storeProducts as a reliable fallback)
    let contextText = 'No relevant products found in store inventory.';
    let finalProducts = storeProducts;

    // Attempt Advanced RAG (Vector Search) — only meaningful when there's text
    // to embed. An image-only message has no query string, so we skip straight
    // to the full inventory list rather than embedding an empty/generic string.
    if (customerMessage && customerMessage.trim().length > 0) {
      try {
        const queryVector = await generateEmbedding(customerMessage);
        const { data: matchedProducts } = await supabase.rpc('match_products', {
          query_embedding: queryVector,
          match_threshold: 0.3,
          match_count: 5,
          org_id: orgId,
        });
        if (matchedProducts && matchedProducts.length > 0) {
          finalProducts = matchedProducts;
        }
      } catch (ragError) {
        console.log('[RAG WARNING]: Vector search failed or not setup, falling back to standard products.');
      }
    }

  // 3. Combine Prompts - inventory context + strict JSON output contract.
    if (finalProducts && finalProducts.length > 0) {
        contextText = finalProducts
            .map(p => `- Product: ${p.name} | Price: ৳${p.price} | Stock: ${p.stock_status} | Details: ${p.description} | Image URL: ${p.image_url || 'null'}`)
            .join('\n');
    }
    // 3. Combine Prompts — inventory context + strict JSON output contract.
    // The JSON contract is appended as a fixed block (not left to the
    // customizable customSystemPrompt) so store owners can't accidentally
    // break the output format by editing their bot's personality prompt.
    const fullSystemPrompt = `${UNIVERSAL_MASTER_RULE}

Store Personality & Rules:
${customSystemPrompt}

Use ONLY the following ground-truth product inventory data to answer customer queries:

[INVENTORY DATA]
${contextText}

Guidelines:
- Keep responses friendly, clear, and relevant to the customer's store queries.
- Do not make up product prices or details outside the inventory data.
- If the customer sends a photo, compare it against the inventory data above and mention the closest matching products by name.

[RESPONSE FORMAT - MANDATORY]
    You MUST respond with ONLY a single valid JSON object (no markdown fences, no text outside the JSON). Structure:
    {
      "reply": "your conversational reply to the customer, as plain text",
      "image_url": "If you are recommending a specific product from the inventory, put its exact image URL here. Otherwise, put null.",
      "orderData": null,
      "handover": false // 🚨 CRITICAL: Set to true ONLY IF the customer is angry, frustrated, explicitly asks to speak to a human, or asks about refunds/cancellations. Otherwise keep it false.
    }
Set "orderData" to null for every normal message. ONLY when the customer has explicitly confirmed they want to place an order:
{
  "customerName": "<full name>",
  "phone": "<phone number>",
  "address": "<delivery address>",
  "products": "<products and quantities as a short readable string>",
  "totalPrice": <number, no currency symbol>
}
If any required order field (name, phone, address) is missing, do NOT set orderData yet - instead set it to null and ask in "reply".`;
    // 4. Build Conversation Memory (Chat History)
    const messages = [{ role: 'system', content: fullSystemPrompt }];

    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg) => {
        const role = msg.direction === 'incoming' ? 'user' : 'assistant';
        messages.push({ role, content: msg.message });
      });
    }

    // 5. Current turn — multimodal content array when an image is present,
    // plain string otherwise. Mixing content shapes across history vs. the
    // latest turn is fine; Groq/OpenAI-compatible APIs only require the
    // *current* message to carry the multimodal array.
   // 5. Current turn - multimodal content array when an image is present
    if (imageUrl) {
        let finalImagePayload = imageUrl;

        // 🚀 MAGIC: Download Facebook Image and Convert to Base64 for Groq!
        if (imageUrl.startsWith('http')) {
            try {
                const imgResponse = await fetch(imageUrl);
                const arrayBuffer = await imgResponse.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString('base64');
                const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                // Create a data URI string that Groq can read directly without getting blocked
                finalImagePayload = `data:${contentType};base64,${base64Data}`;
            } catch (err) {
                console.error('[IMAGE CONVERSION ERROR]:', err.message);
            }
        }

        messages.push({
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: customerMessage && customerMessage.trim().length > 0 
                        ? customerMessage 
                        : 'The customer sent this image. Identify the product shown and compare it closely with the provided inventory list to see if we have it.'
                },
                { 
                    type: 'image_url', 
                    image_url: { url: finalImagePayload } 
                }
            ]
        });
    } else {
        messages.push({ role: 'user', content: customerMessage });
    }

    // 6. Generate AI Reply — JSON mode enforced at the API level so the
    // sampler itself is constrained to valid JSON output.
    const chatCompletion = await activeGroq.chat.completions.create({
      messages,
      model: selectedModel,
      temperature: 0.3,
      max_completion_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const rawContent = chatCompletion.choices[0]?.message?.content;
    return safeParseAIResponse(rawContent);

  } catch (err) {
    console.error('[AI Agent Service Error]:', err);
    return {
      reply: 'An internal error occurred while processing the AI response.',
      orderData: null,
      error: err.message,
    };
  }
};