// src/middlewares/errorHandler.js
// Centralized 4-argument Express error handler.
// Must be the LAST middleware registered in app.js.
// Catches errors from:
//   - next(err) calls in controllers / services
//   - Multer file upload errors
//   - Joi validation errors
//   - Custom AppError instances

import multer from "multer";
import { AppError } from "../utils/response.js";

const errorHandler = (err, req, res, next) => {
    // Default values
    let status = err.status || 500;
    let message = err.message || "An unexpected error occurred.";

    // ── Multer errors (file size, unexpected field, etc.) ──────────────────────
    if (err instanceof multer.MulterError) {
        status = 400;
        if (err.code === "LIMIT_FILE_SIZE") {
            message = "File is too large. Maximum allowed size is 5 MB.";
        } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
            message = `Unexpected field "${err.field}". Use the field name "avatar".`;
        } else {
            message = `File upload error: ${err.message}`;
        }
    }

    // ── Joi validation errors ──────────────────────────────────────────────────
    if (err.isJoi || err.name === "ValidationError") {
        status = 422;
        message = err.details
            ? err.details.map((d) => d.message).join(", ")
            : err.message;
    }

    // ── Supabase / PostgreSQL unique constraint violations ─────────────────────
    if (err.message && err.message.includes("duplicate key")) {
        status = 409;
        if (err.message.includes("phone")) {
            message = "This phone number is already registered to another account.";
        } else if (err.message.includes("email")) {
            message = "This email address is already in use.";
        } else {
            message = "A record with this value already exists.";
        }
    }

    // ── Operational errors (AppError) — safe to show to client ────────────────
    if (err instanceof AppError && err.isOperational) {
        return res.status(status).json({ success: false, message });
    }

    // ── Programming / unknown errors — hide details in production ─────────────
    console.error("Unhandled Error:", err);

    return res.status(status).json({
        success: false,
        message:
            process.env.NODE_ENV === "production"
                ? "An unexpected error occurred. Please try again later."
                : message,
    });
};

export default errorHandler;
