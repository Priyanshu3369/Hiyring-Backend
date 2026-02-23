// routes/applicationRoutes.js
import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
    getApplications,
    createApplication,
} from "../controllers/applicationController.js";

const router = express.Router();

// GET  /api/v1/applications — list user's applications (protected)
router.get("/", protect, getApplications);

// POST /api/v1/applications — apply for a job (protected)
router.post("/", protect, createApplication);

export default router;
