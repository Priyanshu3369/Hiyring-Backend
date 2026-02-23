// models/User.js
// Data-access layer for the `users` table.
// Controllers never write raw Supabase queries — they call these methods instead.
// This keeps DB logic in one place and makes future refactoring easy.

import supabase from "../config/db.js";

const User = {
  /**
   * Find a user by email.
   * Returns the full row (including password_hash) so the caller
   * can do bcrypt comparison. Never expose this object directly to the client.
   */
  async findByEmail(email) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, password_hash, first_name, last_name, status, created_at")
      .eq("email", email.toLowerCase().trim())
      .single(); // returns null instead of array when not found

    if (error && error.code !== "PGRST116") {
      // PGRST116 = "no rows returned" — not a real error for our purposes
      throw new Error(error.message);
    }

    return data; // null if not found
  },

  /**
   * Find a user by their UUID primary key.
   * Used by authMiddleware after token verification to attach user data to req.
   */
  async findById(id) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, status, created_at")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Insert a new user row.
   * We set required NOT-NULL columns that are not part of the auth flow
   * (first_name, last_name, user_type) to safe placeholder defaults so the
   * DB constraint is satisfied. These can be updated in a separate profile flow.
   */
  async create({ email, passwordHash, firstName, lastName }) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        user_type: "candidate",
        first_name: firstName,
        last_name: lastName,
      })
      .select("id, email, first_name, last_name, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Stamp last_login_at so you have an audit trail.
   * Fire-and-forget — we don't await this in the login controller.
   */
  async updateLastLogin(id) {
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", id);
  },
};

export default User;