import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../config/supabase.js';
import { generateEmbedding, buildProductEmbeddingText } from '../services/ragService.js';

/**
 * One-time / Maintenance Script:
 * Scans all products with `embedding IS NULL` and generates embeddings.
 */
async function backfillMissingEmbeddings() {
  console.log('=====================================================');
  console.log('🔄 STARTING AUTOMATED EMBEDDING BACKFILL FOR PRODUCTS');
  console.log('=====================================================');

  try {
    // 1. Fetch all products where embedding is NULL
    const { data: products, error } = await supabase
      .from('products')
      .select('id, org_id, name, description, price, stock_status, embedding')
      .is('embedding', null);

    if (error) {
      console.error('❌ Error fetching products from Supabase:', error.message);
      process.exit(1);
    }

    if (!products || products.length === 0) {
      console.log('✅ All products already have embeddings! Nothing to sync.');
      process.exit(0);
    }

    console.log(`📦 Found ${products.length} product(s) missing embeddings. Generating now...\n`);

    let successCount = 0;

    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const textToEmbed = buildProductEmbeddingText(prod);
      console.log(`[${i + 1}/${products.length}] Processing: "${prod.name}" ...`);

      const embedding = await generateEmbedding(textToEmbed);

      if (embedding) {
        // Save back to DB
        const { error: updateError } = await supabase
          .from('products')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', prod.id);

        if (updateError) {
          console.error(`   ❌ Failed to save embedding for "${prod.name}":`, updateError.message);
        } else {
          console.log(`   ✅ Embedding saved! (Dimensions: ${embedding.length})`);
          successCount++;
        }
      } else {
        console.warn(`   ⚠️ Could not generate embedding for "${prod.name}"`);
      }
    }

    console.log('\n=====================================================');
    console.log(`🎉 BACKFILL COMPLETE: ${successCount}/${products.length} products updated successfully.`);
    console.log('=====================================================');
    process.exit(0);
  } catch (err) {
    console.error('Fatal backfill script error:', err);
    process.exit(1);
  }
}

backfillMissingEmbeddings();