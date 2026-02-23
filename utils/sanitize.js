// src/utils/sanitize.js
// Functions to strip sensitive fields before any user object is sent to the client.
// Always pipe DB rows through one of these before res.json().

const SENSITIVE_FIELDS = ["password_hash", "twofa_secret"];

const PUBLIC_FIELDS = [
    "id",
    "first_name",
    "last_name",
    "user_type",
    "profile_photo_url",
    "created_at",
];

/**
 * Strip sensitive server-only fields from a full user row.
 * Returns a new object — does not mutate the original.
 * @param {object} user  Raw row from the users table
 * @returns {object}     Safe user object for authenticated endpoints
 */
export const sanitizeUser = (user) => {
    if (!user) return null;
    const safe = { ...user };
    SENSITIVE_FIELDS.forEach((field) => delete safe[field]);
    return safe;
};

/**
 * Return only public-safe fields for the GET /api/v1/users/:id endpoint.
 * Prevents accidental leakage of email, phone, status, or verification flags.
 * @param {object} user  Raw row from the users table
 * @returns {object}     Public-safe object
 */
export const sanitizePublicUser = (user) => {
    if (!user) return null;
    return PUBLIC_FIELDS.reduce((acc, field) => {
        if (user[field] !== undefined) acc[field] = user[field];
        return acc;
    }, {});
};
