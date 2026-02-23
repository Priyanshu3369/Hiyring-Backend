// src/routes/userRoutes.js
// Mounts all /api/v1/users endpoints.
// Protected routes require JWT via the `protect` middleware.
// Public routes (GET /:id) are open — no auth needed.

import express from "express";
import protect from "../middleware/authMiddleware.js";
import { uploadAvatar } from "../middleware/upload.js";
import {
    getMyProfile,
    updateMyProfile,
    uploadAvatarHandler,
    getPublicProfileHandler,
} from "../controllers/userController.js";

const router = express.Router();

// ── Protected routes — require JWT ─────────────────────────────────────────

// GET /api/v1/users/me — fetch current user's profile
router.get("/me", protect, getMyProfile);

// PUT /api/v1/users/me — update current user's profile
router.put("/me", protect, updateMyProfile);

// POST /api/v1/users/me/avatar — upload avatar image
// uploadAvatar (multer) runs first, then the controller
router.post("/me/avatar", protect, uploadAvatar, uploadAvatarHandler);

// ── Public routes — no auth needed ─────────────────────────────────────────

// GET /api/v1/users/:id — get public profile by user ID
// NOTE: This must be BELOW /me routes to avoid :id capturing "me"
router.get("/:id", getPublicProfileHandler);

export default router;
