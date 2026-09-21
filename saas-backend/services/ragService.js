import { supabase } from '../config/supabase.js';

// Gemini API keys rotation (from .env)
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY,
].filter(Boolean);

let keyIndex = 0;

/**
 * 1. Generate 768-dimension multilingual vector embedding using Google Gemini
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  if (GEMINI_KEYS.length === 0) {
    console.error('[ragService] No GEMINI_API_KEY found');
    return null;
  }

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const apiKey = GEMINI_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % GEMINI_KEYS.length;

    try {
      const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${cleanKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: text.trim().slice(0, 2048) }] },
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const vector = data?.embedding?.values;
      if (Array.isArray(vector) && vector.length === 768) {
        return vector;
      }
    } catch (err) {
      console.warn(`[ragService] Key error, switching key: ${err.message}`);
    }
  }

  console.error('[ragService] All Gemini embedding keys exhausted.');
  return null;
}

/**
 * 2. Helper to build semantic representation for a product
 */
export function buildProductEmbeddingText(product) {
  const parts = [];
  if (product.name || product.title) parts.push(`Product: ${product.name || product.title}`);
  if (product.description) parts.push(`Description: ${product.description}`);
  if (product.price !== undefined && product.price !== null) parts.push(`Price: ${product.price}`);
  if (product.stock_status) parts.push(`Status: ${product.stock_status}`);
  return parts.join('. ');
}

/**
 * 3. Auto Generate & Update embedding for a single product
 */
export async function embedAndSaveProduct(productId, productData) {
  try {
    const textToEmbed = buildProductEmbeddingText(productData);
    const embedding = await generateEmbedding(textToEmbed);
    if (!embedding) return false;

    const { error } = await supabase
      .from('products')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', productId);

    return !error;
  } catch (err) {
    console.error('[ragService] embedAndSaveProduct error:', err.message);
    return false;
  }
}

/**
 * 4. Enterprise Hybrid Search (Vector + PostgreSQL Trigram Keyword)
 * Returns top 3-4 matches only
 */
export async function searchStoreProducts({ orgId, query, matchCount = 4 }) {
  if (!query || typeof query !== 'string' || !query.trim() || !orgId) return [];

  try {
    const queryEmbedding = await generateEmbedding(query);
    const vectorParam = queryEmbedding || Array(768).fill(0);

    const { data: matchedProducts, error } = await supabase.rpc('match_products_hybrid', {
      query_embedding: vectorParam,
      query_text: query.trim(),
      match_count: matchCount,
      filter_org_id: orgId,
    });

    if (error) {
      console.error('[ragService] match_products_hybrid RPC error:', error.message);
      return [];
    }

    return matchedProducts || [];
  } catch (err) {
    console.error('[ragService] searchStoreProducts unexpected error:', err.message);
    return [];
  }
}