import { pipeline } from '@xenova/transformers';
import { supabase } from '../config/supabase.js';

let embedder = null;

/**
 * 1. Initialize local embedding pipeline (all-MiniLM-L6-v2 generates 384-dimension vectors)
 */
async function getEmbedder() {
  if (!embedder) {
    console.log('[ragService] Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[ragService] Embedding model loaded successfully.');
  }
  return embedder;
}

/**
 * 2. Generate 384-dimensional vector from text
 * @param {string} text - Product text or customer query
 * @returns {Promise<number[]>} - 384-dimensional array of floats
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }

  try {
    const pipe = await getEmbedder();
    const output = await pipe(text.trim(), { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.error('[ragService] generateEmbedding error:', err.message);
    return null;
  }
}

/**
 * 3. Helper to create embedding string representation for product
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
 * 4. Auto Generate & Update embedding for a single product
 */
export async function embedAndSaveProduct(productId, productData) {
  try {
    const textToEmbed = buildProductEmbeddingText(productData);
    const embedding = await generateEmbedding(textToEmbed);

    if (!embedding) {
      console.warn(`[ragService] Could not generate embedding for product ${productId}`);
      return false;
    }

    const { error } = await supabase
      .from('products')
      .update({ embeddings: embedding })
      .eq('id', productId);

    if (error) {
      console.error(`[ragService] Failed to save embedding for product ${productId}:`, error.message);
      return false;
    }

    console.log(`[ragService] Successfully generated & saved embedding for: ${productData.name || productData.title} (${productId})`);
    return true;
  } catch (err) {
    console.error('[ragService] embedAndSaveProduct error:', err.message);
    return false;
  }
}

/**
 * 5. Vector Search (RAG) using Supabase RPC 'match_products'
 * Strictly filtered by org_id for multi-tenant isolation
 */
export async function searchStoreProducts({ orgId, query, matchCount = 5, matchThreshold = 0.25 }) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      console.warn('[ragService] Query embedding generation failed.');
      return [];
    }

    const { data: matchedProducts, error } = await supabase.rpc('match_products', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      org_id: orgId,
    });

    if (error) {
      console.error('[ragService] match_products RPC error:', error.message);
      return [];
    }

    console.log(`[ragService] Vector search found ${matchedProducts?.length || 0} matches for query: "${query}"`);
    return matchedProducts || [];
  } catch (err) {
    console.error('[ragService] searchStoreProducts unexpected error:', err.message);
    return [];
  }
}