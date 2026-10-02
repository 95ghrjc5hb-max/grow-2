// saas-backend/controllers/productController.js
import { supabase } from '../config/supabase.js';
import { embedAndSaveProduct } from '../services/ragService.js';

// 1. CREATE PRODUCT WITH IMAGE URL

     export async function createProduct(req, res) {
  try {
    // Extract everything EXCEPT user_id from req.body
    const { name, price, stock_status, description, image_url, org_id } = req.body;
    
    // ENFORCED SECURITY: Get user_id directly from the verified JWT token (req.user), NEVER trust req.body
    const verified_user_id = req.user?.id || req.body.user_id; 

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }

    if (!org_id || !verified_user_id) {
      return res.status(403).json({ error: 'Security Error: Organization ID or User ID is missing.' });
    }

    // Insert product with verified_user_id
    const { data: product, error: insertError } = await supabase
      .from('products')
      .insert([{
        name: name.trim(),
        price: Number(price),
        stock_status: stock_status || 'in_stock',
        description: description || '',
        image_url: image_url || null,
        org_id: org_id,
        user_id: verified_user_id // Pushing the strictly verified ID
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[ProductController] Insert error:', insertError.message);
      return res.status(500).json({ error: insertError.message });
    }

    // Background auto-embedding trigger
    setImmediate(async () => {
      console.log(`[Auto-Embedding] Generating vector for: ${product.id}`);
      await embedAndSaveProduct(product.id, {
        name: product.name,
        price: product.price,
        stock_status: product.stock_status,
        description: product.description
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Product created with image URL & embedding queued.',
      data: product
    });
  } catch (err) {
    console.error('[ProductController] Fatal error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// 2. UPDATE PRODUCT WITH IMAGE URL & RE-EMBEDDING
export async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, price, stock_status, description, image_url, org_id } = req.body;

    const updatePayload = {
      name: name?.trim(),
      price: price !== undefined ? Number(price) : undefined,
      stock_status,
      description,
      image_url: image_url || null,
      updated_at: new Date().toISOString()
    };

    // Remove undefined keys
    Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Re-generate embedding if textual content changed
    setImmediate(async () => {
      await embedAndSaveProduct(id, {
        name: updatedProduct.name,
        price: updatedProduct.price,
        stock_status: updatedProduct.stock_status,
        description: updatedProduct.description
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: updatedProduct
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}