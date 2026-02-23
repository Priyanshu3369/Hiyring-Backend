// routes/authRoutes.js
// Defines all auth-related routes and the protected dashboard route.
// Thin layer — no logic here, just wiring controllers and middleware together.

import express from "express";
import {
  signup,
  login,
  logout,
  getDashboard,
} from "../controllers/authController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// ── Public routes ──────────────────────────────────────────────────────────
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/auth/logout", logout);

// ── Protected routes ───────────────────────────────────────────────────────
// `protect` middleware runs first; if it calls next(), getDashboard executes.
router.get("/dashboard", protect, getDashboard);

export default router;