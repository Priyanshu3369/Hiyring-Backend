// config/db.js
// Initializes and exports a single Supabase client instance.
// Import this wherever you need database access instead of re-initialising.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables."
  );
}

// createClient is lightweight — this singleton is safe for concurrent requests.
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;