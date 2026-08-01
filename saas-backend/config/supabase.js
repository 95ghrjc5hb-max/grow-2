import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
// Now it matches the exact variable name in your .env file
const supabaseKey = process.env.SUPABASE_KEY; 

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: Supabase URL or Key is missing in the .env file!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
