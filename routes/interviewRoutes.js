// routes/interviewRoutes.js
// Proxy routes that forward interview requests to the Python FastAPI AI service.
// This keeps the frontend talking to a single backend origin.

import express from "express";

const router = express.Router();

// Python AI service URL — adjust port if needed
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

/**
 * Generic proxy helper — forwards request body to the Python service
 * and pipes back the response.
 */
async function proxyToAI(endpoint, reqBody, res) {
  try {
    const response = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data.detail || "AI service error",
      });
    }

    return res.json(data);
  } catch (err) {
    console.error(`[Interview Proxy] ${endpoint} error:`, err.message);
    return res.status(502).json({
      success: false,
      message: "AI interview service is unavailable. Please try again later.",
    });
  }
}

// ── POST /start — Start a new interview session ────────────────────────────
router.post("/start", async (req, res) => {
  await proxyToAI("/interview/start", req.body, res);
});

// ── POST /answer — Submit an answer and get next question ──────────────────
router.post("/answer", async (req, res) => {
  await proxyToAI("/interview/answer", req.body, res);
});

// ── POST /stop — End the interview and get summary ─────────────────────────
router.post("/stop", async (req, res) => {
  await proxyToAI("/interview/stop", req.body, res);
});

export default router;
