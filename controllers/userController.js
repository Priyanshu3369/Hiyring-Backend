// src/controllers/userController.js
// Thin orchestration layer — validates input, calls service functions,
// and sends the standardised JSON response. No raw DB queries here.

import { sendSuccess, sendError, AppError } from "../utils/response.js";
import { sanitizeUser, sanitizePublicUser } from "../utils/sanitize.js";
import { updateProfileSchema } from "../utils/validators.js";
import {
    getUserById,
    updateUserProfile,
    updateAvatarUrl,
    getPublicProfile,
} from "../services/userService.js";
import {
    uploadAvatar as uploadAvatarToStorage,
    deleteOldAvatar,
} from "../services/storageService.js";

// ── GET /api/v1/users/me ────────────────────────────────────────────────────
/**
 * Returns the authenticated user's full profile (sensitive fields stripped).
 * req.user is populated by the protect middleware (contains at minimum { id }).
 */
export const getMyProfile = async (req, res, next) => {
    try {
        const user = await getUserById(req.user.id);
        return sendSuccess(res, "Profile fetched successfully.", sanitizeUser(user));
    } catch (error) {
        next(error);
    }
};

// ── PUT /api/v1/users/me ────────────────────────────────────────────────────
/**
 * Updates the authenticated user's editable profile fields.
 * Validates input with Joi, whitelists fields in the service, returns updated profile.
 */
export const updateMyProfile = async (req, res, next) => {
    try {
        // Validate incoming body — reject unknown fields (prevents mass assignment)
        const { error: validationError, value } = updateProfileSchema.validate(
            req.body,
            { abortEarly: false }
        );

        if (validationError) {
            const errors = validationError.details.map((d) => d.message);
            return sendError(res, "Validation failed.", 422, errors);
        }

        const updated = await updateUserProfile(req.user.id, value);
        return sendSuccess(res, "Profile updated successfully.", sanitizeUser(updated));
    } catch (error) {
        next(error);
    }
};

// ── POST /api/v1/users/me/avatar ────────────────────────────────────────────
/**
 * Handles avatar upload:
 *   1. multer middleware (upload.js) runs before this — file is in req.file
 *   2. Delete old avatar from storage (non-fatal if it fails)
 *   3. Upload new file buffer to Supabase Storage
 *   4. Update profile_photo_url in DB
 *   5. Return updated profile
 */
export const uploadAvatarHandler = async (req, res, next) => {
    try {
        if (!req.file) {
            return sendError(res, "No file uploaded. Include a file with field name \"avatar\".", 400);
        }

        // Fetch current user to get old avatar URL for cleanup
        const currentUser = await getUserById(req.user.id);

        // Fire-and-forget old avatar deletion — don't block the response
        deleteOldAvatar(currentUser.profile_photo_url).catch(() => { });

        // Upload new avatar — returns public URL
        const publicUrl = await uploadAvatarToStorage(
            req.user.id,
            req.file.buffer,
            req.file.mimetype
        );

        // Persist new URL in DB
        const updated = await updateAvatarUrl(req.user.id, publicUrl);

        return sendSuccess(res, "Avatar uploaded successfully.", sanitizeUser(updated));
    } catch (error) {
        next(error);
    }
};

// ── GET /api/v1/users/:id ───────────────────────────────────────────────────
/**
 * Public profile endpoint — no auth required.
 * Returns only a safe subset of fields (no email, phone, status, 2FA info).
 */
export const getPublicProfileHandler = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Basic UUID format validation to avoid malformed DB queries
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return sendError(res, "Invalid user ID format.", 400);
        }

        const user = await getPublicProfile(id);
        return sendSuccess(res, "Public profile fetched successfully.", sanitizePublicUser(user));
    } catch (error) {
        next(error);
    }
};
