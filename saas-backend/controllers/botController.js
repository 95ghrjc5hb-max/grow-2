import { supabase } from '../config/supabase.js';

// Fetch all AI training products for authenticated user
export const getProducts = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add new product entry for AI training dataset
export const addProduct = async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { name, price, stock, description } = req.body;

  try {
    const { data, error } = await supabase
      .from('products')
      .insert([{ user_id: userId, name, price, stock, description }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
