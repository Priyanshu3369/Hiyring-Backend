// src/routes/jobRoutes.js
import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getJobs } from "../controllers/jobController.js";
import { getSavedJobs, toggleSavedJob } from "../controllers/savedJobController.js";

const router = express.Router();

// GET /api/v1/jobs — list all jobs (public)
router.get("/", getJobs);

// GET /api/v1/jobs/saved — get user's saved jobs (protected)
router.get("/saved", protect, getSavedJobs);

// POST /api/v1/jobs/saved/:jobId — toggle save/unsave a job (protected)
router.post("/saved/:jobId", protect, toggleSavedJob);

export default router;
