import { pipeline } from '@xenova/transformers';
import { supabase } from '../config/supabase.js'; 
import Groq from 'groq-sdk';

// 🔑 SaaS Owner Master Groq API Key (Shared for all stores)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let extractor = null;

const getExtractor = async () => {
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
 * Multi-Tenant AI Agent Service
 * Handles Store Owner A, B, C seamlessly using one Master API Key
 */
export const handleCustomerMessage = async ({ userMessage, storeOwnerId }) => {
  try {
    // 1. Fetch Store Owner's Personal Bot Config (Prompt, Model, Bot Name, etc.)
    const { data: botConfig } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('user_id', storeOwnerId)
      .single();

    const customSystemPrompt = botConfig?.system_prompt || "You are a helpful customer support AI agent for an e-commerce store.";
    const selectedModel = botConfig?.model || 'llama-3.1-8b-instant';

    // 2. Generate Embedding & Search Products for THIS specific Store Owner
    const queryVector = await generateEmbedding(userMessage);

    const { data: matchedProducts } = await supabase.rpc('match_products', {
      query_embedding: queryVector,
      match_threshold: 0.3,
      match_count: 5,
      store_owner_id: storeOwnerId // 🔒 Store A vs Store B Privacy
    });

    // 3. Format Inventory Context
    let contextText = 'No relevant products found in store inventory.';
    if (matchedProducts && matchedProducts.length > 0) {
      contextText = matchedProducts
        .map(
          (p) =>
            `- Product: ${p.name} | Price: ৳${p.price} | Stock: ${p.stock_status} | Details: ${p.description} | Image: ${p.image_url}`
        )
        .join('\n');
    }

    // 4. Combine Store Owner's Custom System Prompt + RAG Data
    const fullSystemPrompt = `${customSystemPrompt}

Use ONLY the following ground-truth product inventory data to answer customer queries:

[INVENTORY DATA]
${contextText}

Guidelines:
- Keep responses friendly, clear, and relevant to the customer's store queries.
- Do not make up product prices or details outside the inventory data.`;

    // 5. Generate AI Reply using Master Groq API Key
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: userMessage }
      ],
      model: selectedModel,
      temperature: 0.3,
    });

    return {
      reply: chatCompletion.choices[0]?.message?.content || 'Sorry, I could not process your request.',
      matchedProducts: matchedProducts || []
    };

  } catch (err) {
    console.error('AI Agent Service Error:', err);
    return {
      reply: 'An internal error occurred while processing the AI response.',
      error: err.message
    };
  }
};
