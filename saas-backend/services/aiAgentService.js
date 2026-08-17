import { pipeline } from '@xenova/transformers';
import { supabase } from '../config/supabase.js';
import Groq from 'groq-sdk';

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
  };

  if (!rawContent || typeof rawContent !== 'string') return fallback;

  const tryParse = (str) => {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  };

  // Attempt 1: direct parse (expected path when JSON mode behaves).
  let parsed = tryParse(rawContent.trim());

  // Attempt 2: model wrapped JSON in markdown fences or added stray prose
  // around it — extract the outermost {...} block and retry.
  if (!parsed) {
    const firstBrace = rawContent.indexOf('{');
    const lastBrace = rawContent.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = tryParse(rawContent.slice(firstBrace, lastBrace + 1));
    }
  }

  // Attempt 3: total failure — treat the raw text as the reply so the customer
  // still gets *something* coherent instead of a generic error.
  if (!parsed) {
    return { reply: rawContent.trim().slice(0, 2000), orderData: null };
  }

  const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : fallback.reply;

  // orderData must be a real object with the fields the controller expects.
  // A malformed or partial orderData is worse than none — it would insert a
  // garbage row into `orders`. Reject it rather than pass it through.
  const orderData = parsed.orderData && typeof parsed.orderData === 'object' && !Array.isArray(parsed.orderData)
    ? parsed.orderData
    : null;

  return { reply, orderData };
};

export const handleCustomerMessage = async ({
  customerMessage,
  orgId,
  storeProducts,
  conversationHistory,
  imageUrl = null,
}) => {
  try {
    // 1. Fetch Store Owner's Personal Bot Config
    const { data: botConfig } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle()

    const customSystemPrompt = botConfig?.system_prompt || 'You are a helpful customer support AI agent for an e-commerce store.';

    // Route to a vision-capable model whenever an image is present, regardless
    // of what the org configured — a text-only model will reject image content.
    const configuredModel = botConfig?.model || DEFAULT_TEXT_MODEL;
    const selectedModel = imageUrl
      ? (VISION_CAPABLE_MODELS.has(configuredModel) ? configuredModel : VISION_MODEL)
      : configuredModel;

    if (imageUrl && selectedModel !== configuredModel) {
      console.log(`[MODEL OVERRIDE]: org ${orgId} configured "${configuredModel}" (not vision-capable) -> using "${selectedModel}" for image message.`);
    }

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

    if (finalProducts && finalProducts.length > 0) {
      contextText = finalProducts
        .map((p) => `- Product: ${p.name} | Price: ৳${p.price} | Stock: ${p.stock_status} | Details: ${p.description}`)
        .join('\n');
    }

    // 3. Combine Prompts — inventory context + strict JSON output contract.
    // The JSON contract is appended as a fixed block (not left to the
    // customizable customSystemPrompt) so store owners can't accidentally
    // break the output format by editing their bot's personality prompt.
    const fullSystemPrompt = `${customSystemPrompt}

Use ONLY the following ground-truth product inventory data to answer customer queries:

[INVENTORY DATA]
${contextText}

Guidelines:
- Keep responses friendly, clear, and relevant to the customer's store queries.
- Do not make up product prices or details outside the inventory data.
- If the customer sends a photo, compare it against the inventory data above and mention the closest matching product(s) by name if one exists; if nothing matches, say so honestly rather than guessing.

[RESPONSE FORMAT — MANDATORY]
You MUST respond with ONLY a single valid JSON object (no markdown fences, no text outside the JSON). Structure:
{
  "reply": "<your conversational reply to the customer, as plain text>",
  "orderData": null
}

Set "orderData" to null for every normal message. ONLY when the customer has explicitly confirmed they want to place an order AND you have enough information, set "orderData" to an object with this exact shape instead of null:
{
  "customerName": "<full name>",
  "phone": "<phone number>",
  "address": "<delivery address>",
  "products": "<products and quantities as a short readable string>",
  "totalPrice": <number, no currency symbol>
}
If any required order field (name, phone, address) is missing, do NOT set orderData yet — instead set it to null and use "reply" to ask the customer for the missing information.`;

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
    if (imageUrl) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: customerMessage && customerMessage.trim().length > 0
              ? customerMessage
              : 'The customer sent this image with no caption. Identify the product shown and compare it against the inventory data.',
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      });
    } else {
      messages.push({ role: 'user', content: customerMessage });
    }

    // 6. Generate AI Reply — JSON mode enforced at the API level so the
    // sampler itself is constrained to valid JSON output.
    const chatCompletion = await groq.chat.completions.create({
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