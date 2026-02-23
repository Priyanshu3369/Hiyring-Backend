// services/resumeService.js
// Handles resume file upload to Supabase Storage and updates candidate_profiles.
// Uses the existing candidate_profiles table (resume_url, resume_text, resume_uploaded_at).
// Extracts text from PDFs using the Python AI service (robust parsing).

import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import FormData from "form-data";
import supabaseAdmin from "../config/supabaseAdmin.js";
import supabase from "../config/db.js";

const BUCKET = "resumes";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

/**
 * Upload a resume file to Supabase Storage and update the candidate_profiles row.
 * Text is extracted from the PDF using the Python AI service.
 *
 * @param {Buffer} fileBuffer   File contents from multer memoryStorage
 * @param {string} fileName     Original file name
 * @param {string} mimeType     e.g. "application/pdf"
 * @param {string} userId       UUID of the authenticated user
 * @returns {object}            { profile_id, file_url, file_name }
 */
export const uploadResume = async (fileBuffer, fileName, mimeType, userId) => {
    const ext = fileName.split(".").pop() || "pdf";
    const storagePath = `${userId}/${uuidv4()}.${ext}`;

    // 1. Upload file to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: false,
        });

    if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 2. Get public URL
    const { data: urlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

    const fileUrl = urlData?.publicUrl || "";

    // 3. Extract text from PDF via Python AI service (robust)
    let resumeText = "";
    try {
        console.log(`[Resume] Clearing text via Python AI service: mimeType="${mimeType}", size=${fileBuffer.length}`);

        if (mimeType === "application/pdf") {
            const formData = new FormData();
            formData.append("file", fileBuffer, { filename: fileName, contentType: mimeType });

            const aiResponse = await axios.post(`${AI_SERVICE_URL}/interview/parse-resume`, formData, {
                headers: { ...formData.getHeaders() },
            });

            if (aiResponse.data?.success) {
                resumeText = aiResponse.data.text || "";
                console.log(`[Resume] Python service extracted ${resumeText.length} chars`);
            }
        }
    } catch (err) {
        console.error("[Resume] Python AI parsing FAILED:", err.response?.data || err.message);
    }

    // 4. Upsert candidate_profiles row with resume data
    const { data, error: dbError } = await supabase
        .from("candidate_profiles")
        .upsert(
            {
                user_id: userId,
                resume_url: fileUrl,
                resume_text: resumeText || "",
                resume_uploaded_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        )
        .select("id, resume_url")
        .single();

    if (dbError) {
        throw new Error(`DB upsert failed: ${dbError.message}`);
    }

    return {
        profile_id: data.id,
        file_url: data.resume_url,
        file_name: fileName,
    };
};

/**
 * Get resume data from candidate_profiles by profile ID.
 *
 * @param {string} profileId   UUID of the candidate_profiles row
 * @returns {object}           { id, resume_url, resume_text, resume_uploaded_at }
 */
export const getResume = async (profileId) => {
    const { data, error } = await supabase
        .from("candidate_profiles")
        .select("id, resume_url, resume_text, resume_uploaded_at")
        .eq("id", profileId)
        .single();

    if (error) {
        throw new Error(`Resume not found: ${error.message}`);
    }

    return data;
};
