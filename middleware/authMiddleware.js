// middleware/authMiddleware.js
// Reads the JWT from the Authorization header, verifies it,
// then attaches the full user object to req.user so controllers can use it.
//
// Flow:
//   Client → "Authorization: Bearer <token>" header
//   → middleware verifies signature + expiry
//   → fetches fresh user from DB (catches deleted/suspended/soft-deleted accounts)
//   → calls next() or returns 401

import jwt from "jsonwebtoken";
import supabase from "../config/db.js";

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Expect "Bearer <token>"
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Access denied.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify signature and expiry — throws if invalid
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      const message =
        jwtError.name === "TokenExpiredError"
          ? "Token has expired. Please log in again."
          : "Invalid token. Access denied.";
      return res.status(401).json({ success: false, message });
    }

    // Fetch fresh user — also check deleted_at to reject soft-deleted accounts
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, status, deleted_at, created_at")
      .eq("id", decoded.id)
      .single();

    if (dbError || !user) {
      return res.status(401).json({
        success: false,
        message: "User belonging to this token no longer exists.",
      });
    }

    // Reject soft-deleted users
    if (user.deleted_at !== null && user.deleted_at !== undefined) {
      return res.status(401).json({
        success: false,
        message: "This account has been deleted.",
      });
    }

    // Block suspended/inactive accounts
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Contact support.",
      });
    }

    // Attach user to request for downstream controllers
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

export default protect;