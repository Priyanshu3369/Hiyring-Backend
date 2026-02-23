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
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

// ── Protected routes ───────────────────────────────────────────────────────
router.get("/dashboard", protect, getDashboard);

export default router;