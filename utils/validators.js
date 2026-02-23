// src/utils/validators.js
// Joi validation schemas for user profile routes.
// Import the relevant schema and call .validate() at the top of each controller.

import Joi from "joi";

// Allowed IANA timezone list — Joi doesn't have built-in tz validation,
// so we accept any non-empty string and rely on server/DB to reject bad values.
// Extend with a custom validator if strict tz enforcement is needed.

export const updateProfileSchema = Joi.object({
    first_name: Joi.string().trim().min(1).max(100).optional().messages({
        "string.min": "First name must not be empty.",
        "string.max": "First name must be at most 100 characters.",
    }),

    last_name: Joi.string().trim().min(1).max(100).optional().messages({
        "string.min": "Last name must not be empty.",
        "string.max": "Last name must be at most 100 characters.",
    }),

    // E.164 international format: +1234567890 (7–15 digits after country code)
    phone: Joi.string()
        .trim()
        .pattern(/^\+[1-9]\d{6,14}$/)
        .optional()
        .allow(null, "")
        .messages({
            "string.pattern.base":
                "Phone must be in E.164 format, e.g. +12025551234.",
        }),

    preferred_language: Joi.string()
        .trim()
        .min(2)
        .max(10)
        .optional()
        .allow(null, "")
        .messages({
            "string.min": "Language code must be at least 2 characters.",
            "string.max": "Language code must be at most 10 characters.",
        }),

    timezone: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional()
        .allow(null, "")
        .messages({
            "string.min": "Timezone must not be empty.",
            "string.max": "Timezone must be at most 100 characters.",
        }),

    // --- Candidate Profile Fields ---
    headline: Joi.string().trim().max(300).allow(null, ""),
    bio: Joi.string().trim().allow(null, ""),
    date_of_birth: Joi.date().iso().allow(null),
    gender: Joi.string().valid("male", "female", "other", "prefer_not_to_say").allow(null),
    country: Joi.string().trim().max(100).allow(null, ""),
    city: Joi.string().trim().max(100).allow(null, ""),
    availability_status: Joi.string().valid("active_looking", "open_to_offers", "not_looking").allow(null),
    expected_salary_min: Joi.number().min(0).allow(null),
    expected_salary_max: Joi.number().min(Joi.ref('expected_salary_min')).allow(null),
    salary_currency: Joi.string().length(3).uppercase().allow(null, ""),
    notice_period_days: Joi.number().integer().min(0).allow(null),
    willing_to_relocate: Joi.boolean(),
    work_preference: Joi.array().items(Joi.string().valid("remote", "onsite", "hybrid")).allow(null),
    resume_url: Joi.string().uri().max(500).allow(null, ""),
    video_intro_url: Joi.string().uri().max(500).allow(null, ""),
    profile_visibility: Joi.string().valid("public", "companies_only", "private").allow(null),
    portfolio_links: Joi.object().pattern(Joi.string(), Joi.string().uri()).allow(null),
    total_experience_months: Joi.number().integer().min(0),

    // --- Nested Collections ---
    experiences: Joi.array().items(Joi.object({
        id: Joi.string().uuid().optional(),
        company_name: Joi.string().required(),
        job_title: Joi.string().required(),
        employment_type: Joi.string().required(), // e.g. full_time, part_time...
        location: Joi.string().allow(null, ""),
        start_date: Joi.date().iso().required(),
        end_date: Joi.date().iso().allow(null),
        is_current: Joi.boolean(),
        description: Joi.string().allow(null, ""),
        sort_order: Joi.number().integer().min(0)
    })).optional(),

    education: Joi.array().items(Joi.object({
        id: Joi.string().uuid().optional(),
        institution_name: Joi.string().required(),
        degree: Joi.string().required(),
        field_of_study: Joi.string().allow(null, ""),
        start_year: Joi.number().integer().min(1950).required(),
        end_year: Joi.number().integer().min(1950).allow(null),
        grade: Joi.string().allow(null, ""),
        description: Joi.string().allow(null, ""),
        sort_order: Joi.number().integer().min(0)
    })).optional(),

    skills: Joi.array().items(Joi.object({
        id: Joi.string().uuid().optional(),
        skill_id: Joi.string().uuid().required(),
        proficiency: Joi.string().valid("beginner", "intermediate", "advanced", "expert").default("intermediate"),
        years_experience: Joi.number().min(0).allow(null),
        is_highlighted: Joi.boolean()
    })).optional(),

    languages: Joi.array().items(Joi.object({
        id: Joi.string().uuid().optional(),
        language_code: Joi.string().required(),
        language_name: Joi.string().required(),
        proficiency: Joi.string().valid("basic", "conversational", "professional", "native").required()
    })).optional(),

    certifications: Joi.array().items(Joi.object({
        id: Joi.string().uuid().optional(),
        title: Joi.string().required(),
        issuing_org: Joi.string().required(),
        issued_date: Joi.date().iso().allow(null),
        expiry_date: Joi.date().iso().allow(null),
        credential_id: Joi.string().allow(null, ""),
        credential_url: Joi.string().uri().allow(null, "")
    })).optional()
})
    // Reject any keys not in the schema — prevents mass assignment attacks
    .options({ allowUnknown: false, stripUnknown: false });
