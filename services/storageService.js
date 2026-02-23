// src/services/storageService.js
// Handles avatar image upload and deletion in Supabase Storage.
// Uses supabaseAdmin (service-role key) because anon key typically lacks storage write permissions.

import { v4 as uuidv4 } from "uuid";
import supabaseAdmin from "../config/supabaseAdmin.js";
import { AppError } from "../utils/response.js";

const BUCKET = "avatars";

/**
 * Upload a file buffer to the "avatars" Supabase Storage bucket.
 * Each user gets a consistent path: avatars/<userId>/<uuid>.<ext>
 * Old files are automatically overwritten if upsert is used.
 *
 * @param {string} userId       UUID of the authenticated user
 * @param {Buffer} fileBuffer   File contents from multer memoryStorage
 * @param {string} mimeType     e.g. "image/jpeg"
 * @returns {string}            Public URL of the uploaded avatar
 */
export const uploadAvatar = async (userId, fileBuffer, mimeType) => {
    const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
    const fileName = `${userId}/${uuidv4()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(fileName, fileBuffer, {
            contentType: mimeType,
            upsert: true, // Replace if same path exists
        });

    if (uploadError) {
        throw new AppError(`Storage upload failed: ${uploadError.message}`, 500);
    }

    // Build the public URL
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(fileName);

    if (!data?.publicUrl) {
        throw new AppError("Failed to retrieve public URL after upload.", 500);
    }

    return data.publicUrl;
};

/**
 * Delete a user's old avatar from storage when they upload a new one.
 * Parses the old URL to extract the storage path, then removes it.
 * Failures are logged but NOT fatal — we don't want to block the new upload.
 *
 * @param {string} oldUrl   The current profile_photo_url stored in the DB
 */
export const deleteOldAvatar = async (oldUrl) => {
    if (!oldUrl) return;

    try {
        // Extract path after "/object/public/avatars/"
        const marker = `/object/public/${BUCKET}/`;
        const idx = oldUrl.indexOf(marker);
        if (idx === -1) return; // Not a storage URL we control — skip

        const filePath = oldUrl.slice(idx + marker.length);

        const { error } = await supabaseAdmin.storage
            .from(BUCKET)
            .remove([filePath]);

        if (error) {
            console.warn("Could not delete old avatar:", error.message);
        }
    } catch (err) {
        console.warn("deleteOldAvatar error (non-fatal):", err.message);
    }
};
