"""
Configuration for the AI Interview Service.
Loads environment variables and defines constants.
"""

import os
from dotenv import load_dotenv

# Load .env from the parent backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# ── OpenAI ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ── Supabase ────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# ── Interview Settings ──────────────────────────────────────────────────────
MAX_INTERVIEW_DURATION_MS = int(os.getenv("MAX_INTERVIEW_DURATION_MS", 5 * 60 * 1000))  # 5 minutes
INTERVIEW_TABLE = "interview_sessions"
