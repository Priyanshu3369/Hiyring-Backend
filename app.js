import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/* -------------------------------------------------------------------------- */
/*                               GLOBAL MIDDLEWARE                            */
/* -------------------------------------------------------------------------- */

// Allowed origin from env
const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

// CORS
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Handle preflight requests explicitly
app.options("*", cors());

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

/* -------------------------------------------------------------------------- */
/*                                  HEALTH CHECK                              */
/* -------------------------------------------------------------------------- */

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/* -------------------------------------------------------------------------- */
/*                                  ROUTES                                    */
/* -------------------------------------------------------------------------- */

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";

// Auth
app.use("/api/auth", authRoutes);

// API v1
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/applications", applicationRoutes);
app.use("/api/v1/interview", interviewRoutes);
app.use("/api/v1/resumes", resumeRoutes);

/* -------------------------------------------------------------------------- */
/*                           DEV DB CONNECTIVITY CHECK                        */
/* -------------------------------------------------------------------------- */

import supabase from "./config/db.js";

app.get("/test-db", async (req, res) => {
  const { data, error } = await supabase.from("users").select("id").limit(1);
  res.json({ data, error });
});

/* -------------------------------------------------------------------------- */
/*                                404 HANDLER                                 */
/* -------------------------------------------------------------------------- */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

/* -------------------------------------------------------------------------- */
/*                              ERROR HANDLER                                 */
/* -------------------------------------------------------------------------- */

import errorHandler from "./middleware/errorHandler.js";
app.use(errorHandler);

export default app;