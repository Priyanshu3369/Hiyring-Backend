// src/middlewares/upload.js
// Multer configuration for avatar file uploads.
// Uses memoryStorage so the file buffer is available in req.file.buffer
// for direct upload to Supabase Storage (no temp files on disk).

import multer from "multer";
import { AppError } from "../utils/response.js";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true); // Accept file
    } else {
        cb(
            new AppError(
                `Invalid file type "${file.mimetype}". Only JPEG, PNG, and WebP images are allowed.`,
                400
            ),
            false
        );
    }
};

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter,
});

// Single-file upload for the "avatar" field
export const uploadAvatar = upload.single("avatar");
