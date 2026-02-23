// src/utils/response.js
// Standardised response helpers to enforce a consistent JSON envelope:
// { success: true/false, message: "...", data: {...} }
// Use these in every controller instead of raw res.json() calls.

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {string} message     Human-readable success message
 * @param {object} [data=null] Response payload
 * @param {number} [status=200] HTTP status code
 */
export const sendSuccess = (res, message, data = null, status = 200) => {
    const body = { success: true, message };
    if (data !== null) body.data = data;
    return res.status(status).json(body);
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message    Human-readable error message
 * @param {number} [status=400] HTTP status code
 * @param {object} [errors=null] Optional field-level validation errors
 */
export const sendError = (res, message, status = 400, errors = null) => {
    const body = { success: false, message };
    if (errors !== null) body.errors = errors;
    return res.status(status).json(body);
};

/**
 * Custom application error class — carry an HTTP status code alongside the message.
 * Throw this inside services/controllers and catch in errorHandler middleware.
 */
export class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
        this.isOperational = true;
    }
}
