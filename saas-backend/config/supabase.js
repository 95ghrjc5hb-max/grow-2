import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase URL or Key is missing in the .env file!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };
export default supabase;
