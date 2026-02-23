// routes/resumeRoutes.js
// REST endpoints for resume upload and retrieval using candidate_profiles table.
// POST /upload  — accepts multipart file + userId, stores in Supabase, returns profile_id
// GET  /:id     — returns resume data from candidate_profiles

import { Router } from "express";
import multer from "multer";
import { uploadResume, getResume } from "../services/resumeService.js";

const router = Router();

// Multer: store file in memory buffer (max 10 MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF, DOC, and DOCX files are allowed."));
        }
    },
});

/**
 * POST /api/v1/resumes/upload
 * Body: multipart form-data with fields:
 *   - resume (file)
 *   - resumeText (string, extracted text)
 *   - userId (string, UUID of the authenticated user)
 */
router.post("/upload", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file provided." });
        }

        const userId = req.body.userId;
        if (!userId) {
            return res.status(400).json({ error: "userId is required." });
        }

        const result = await uploadResume(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            userId
        );

        res.json({
            success: true,
            resume_id: result.profile_id,
            file_url: result.file_url,
            file_name: result.file_name,
        });
    } catch (err) {
        console.error("Resume upload error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/resumes/:id
 * Returns resume data from candidate_profiles.
 */
router.get("/:id", async (req, res) => {
    try {
        const resume = await getResume(req.params.id);
        res.json({
            success: true,
            data: {
                id: resume.id,
                file_url: resume.resume_url,
                resume_text: resume.resume_text,
                file_name: "resume.pdf", // filename not stored in profile, use default
                uploaded_at: resume.resume_uploaded_at,
            },
        });
    } catch (err) {
        console.error("Resume fetch error:", err.message);
        res.status(404).json({ error: err.message });
    }
});

export default router;
