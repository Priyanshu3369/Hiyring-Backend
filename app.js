// app.js
// Express application setup — middleware registration and route mounting.
// Separated from server.js so it can be imported in tests without starting HTTP listener.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ── Global Middleware ──────────────────────────────────────────────────────

// CORS — only allow requests from the configured client origin
const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Parse incoming JSON request bodies
app.use(express.json({ limit: "50mb" })); // Increased for resume base64 data

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────────────────────

// Health check — useful for uptime monitoring and deployment checks
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Auth Routes (existing) ─────────────────────────────────────────────────
import authRoutes from "./routes/authRoutes.js";
app.use("/api", authRoutes);

// ── User Profile Routes (v1) ───────────────────────────────────────────────
import userRoutes from "./routes/userRoutes.js";
app.use("/api/v1/users", userRoutes);

// ── Job Listing Routes (v1) ──────────────────────────────────────────────────
import jobRoutes from "./routes/jobRoutes.js";
app.use("/api/v1/jobs", jobRoutes);

// ── Application Routes (v1) ──────────────────────────────────────────────────
import applicationRoutes from "./routes/applicationRoutes.js";
app.use("/api/v1/applications", applicationRoutes);
// ── Interview AI Routes (proxy to Python FastAPI service) ───────────────────
import interviewRoutes from "./routes/interviewRoutes.js";
app.use("/api/v1/interview", interviewRoutes);

// ── Resume Upload Routes ────────────────────────────────────────────────────
import resumeRoutes from "./routes/resumeRoutes.js";
app.use("/api/v1/resumes", resumeRoutes);

// ── Dev Helper: DB connectivity check ─────────────────────────────────────
import supabase from "./config/db.js";
app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase.from("users").select("id").limit(1);
  res.json({ data, error });
});

// ── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ── Centralized Error Handler ──────────────────────────────────────────────
// MUST be last — catches all errors passed via next(err)
import errorHandler from "./middleware/errorHandler.js";
app.use(errorHandler);

export default app;