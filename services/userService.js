// src/services/userService.js
// All database operations for the user profile feature.
// Controllers never write Supabase queries directly — they call these functions.

import supabase from "../config/db.js";
import { AppError } from "../utils/response.js";

// Fields that are safe to return to authenticated users (excludes password_hash, twofa_secret)
const SAFE_FIELDS = [
    "id",
    "email",
    "first_name",
    "last_name",
    "phone",
    "user_type",
    "status",
    "profile_photo_url",
    "preferred_language",
    "timezone",
    "is_email_verified",
    "is_2fa_enabled",
    "created_at",
    "updated_at",
    "last_login_at",
].join(", ");

// Only these fields may be updated in the 'users' table via PUT /me
const ALLOWED_USER_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "preferred_language",
    "timezone",
];

// Only these fields may be updated in the 'candidate_profiles' table via PUT /me
const ALLOWED_PROFILE_FIELDS = [
    "headline",
    "bio",
    "date_of_birth",
    "gender",
    "country",
    "city",
    "availability_status",
    "expected_salary_min",
    "expected_salary_max",
    "salary_currency",
    "notice_period_days",
    "willing_to_relocate",
    "work_preference",
    "resume_url",
    "video_intro_url",
    "profile_visibility",
    "portfolio_links",
    "total_experience_months",
];

// Nested collections names matching the keys in req.body and the database tables
const NESTED_COLLECTIONS = [
    { key: "experiences", table: "candidate_experiences" },
    { key: "education", table: "candidate_education" },
    { key: "skills", table: "candidate_skills" },
    { key: "languages", table: "candidate_languages" },
    { key: "certifications", table: "candidate_certifications" },
];

/**
 * Fetch the full authenticated user profile.
 * Excludes sensitive fields. Rejects soft-deleted users.
 */
export const getUserById = async (id) => {
    const { data, error } = await supabase
        .from("users")
        .select(`${SAFE_FIELDS}, candidate_profiles(*, candidate_experiences(*), candidate_education(*), candidate_skills(*), candidate_languages(*), candidate_certifications(*))`)
        .eq("id", id)
        .is("deleted_at", null) // Reject soft-deleted users
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new AppError("User not found.", 404);
        }
        throw new AppError(error.message, 500);
    }

    return data;
};

/**
 * Update allowed profile fields only.
 * Handles updates across multiple tables: users, candidate_profiles, and related collections.
 */
export const updateUserProfile = async (id, fields) => {
    // 1. Separate payload for each table
    const userPayload = {};
    ALLOWED_USER_FIELDS.forEach((key) => {
        if (fields[key] !== undefined) userPayload[key] = fields[key];
    });

    const profilePayload = {};
    ALLOWED_PROFILE_FIELDS.forEach((key) => {
        if (fields[key] !== undefined) profilePayload[key] = fields[key];
    });

    // 2. Update 'users' table if needed
    if (Object.keys(userPayload).length > 0) {
        const { error: userError } = await supabase
            .from("users")
            .update(userPayload)
            .eq("id", id)
            .is("deleted_at", null);

        if (userError) {
            if (userError.message.includes("duplicate key") || userError.code === "23505") {
                throw new AppError("This phone number is already registered.", 409);
            }
            throw new AppError(userError.message, 500);
        }
    }

    // 3. Upsert 'candidate_profiles' table
    // Even if profilePayload is empty, we might need the profile ID for nested updates
    const { data: profile, error: profileError } = await supabase
        .from("candidate_profiles")
        .upsert({ ...profilePayload, user_id: id }, { onConflict: "user_id" })
        .select("id")
        .single();

    if (profileError) throw new AppError(profileError.message, 500);
    const profileId = profile.id;

    // 4. Update nested collections (Delete and Re-insert strategy)
    for (const collection of NESTED_COLLECTIONS) {
        if (fields[collection.key] !== undefined) {
            const items = fields[collection.key];

            // A. Delete existing entries for this profile
            const { error: deleteError } = await supabase
                .from(collection.table)
                .delete()
                .eq("candidate_profile_id", profileId);

            if (deleteError) throw new AppError(deleteError.message, 500);

            // B. Insert new entries if any
            if (items && items.length > 0) {
                const itemsToInsert = items.map(item => {
                    const { id, ...rest } = item;
                    return {
                        ...rest,
                        candidate_profile_id: profileId,
                    };
                });

                const { error: insertError } = await supabase
                    .from(collection.table)
                    .insert(itemsToInsert);

                if (insertError) throw new AppError(insertError.message, 500);
            }
        }
    }

    // 5. Final Fetch to return the complete updated state
    return await getUserById(id);
};

/**
 * Update just the profile_photo_url column after a successful avatar upload.
 */
export const updateAvatarUrl = async (id, url) => {
    const { data, error } = await supabase
        .from("users")
        .update({ profile_photo_url: url })
        .eq("id", id)
        .select(SAFE_FIELDS)
        .single();

    if (error) {
        throw new AppError(error.message, 500);
    }

    return data;
};

/**
 * Fetch public-safe profile for GET /api/v1/users/:id.
 * Returns only fields appropriate for unauthenticated viewers.
 */
export const getPublicProfile = async (id) => {
    const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, user_type, profile_photo_url, created_at")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new AppError("User not found.", 404);
        }
        throw new AppError(error.message, 500);
    }

    return data;
};
