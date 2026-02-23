// utils/generateToken.js
// Single responsibility: create a signed JWT.
// Centralising this means you change expiry/algorithm in one file.

import jwt from "jsonwebtoken";

/**
 * @param {string} userId - The user's UUID from the DB
 * @returns {string} Signed JWT
 */
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },          // Payload — keep it minimal; never store sensitive data
    process.env.JWT_SECRET,  // Secret key from env
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

export default generateToken;