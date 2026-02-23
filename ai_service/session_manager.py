"""
Supabase session manager for interview sessions.
Uses DIRECT Supabase REST API calls via httpx (no heavy SDK needed).

Existing Supabase tables used:
  - interview_sessions  (session tracking, scores, status)
  - interview_answers    (per-question answers & scores)
  - interview_templates  (interview configuration)
  - interview_questions  (question bank per template)
"""

import json
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, List
from config import SUPABASE_URL, SUPABASE_ANON_KEY


# ── Supabase REST helpers ───────────────────────────────────────────────────

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

REST_URL = f"{SUPABASE_URL}/rest/v1"


def _request(method: str, table: str, params: dict = None, body: dict = None) -> list:
    """Make a synchronous request to Supabase REST API."""
    url = f"{REST_URL}/{table}"
    with httpx.Client(timeout=30) as client:
        resp = client.request(
            method=method,
            url=url,
            headers=HEADERS,
            params=params or {},
            json=body,
        )
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.text:
            return []
        return resp.json()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# APPLICATION CONTEXT (lookup from job_applications + jobs)
# ─────────────────────────────────────────────────────────────────────────────

def get_application_context(job_id: str, candidate_id: str = None) -> dict:
    """
    Fetch real FK data from job_applications and jobs tables.
    Returns: application_id, candidate_id, company_id, template_id,
             job_title, job_description
    """
    context = {
        "application_id": None,
        "candidate_id": candidate_id,
        "company_id": None,
        "template_id": None,
        "job_title": "",
        "job_description": "",
    }

    # 1. Get job details → company_id, interview_template_id, title, description
    if job_id:
        try:
            jobs = _request("GET", "jobs", params={
                "id": f"eq.{job_id}",
                "select": "id,company_id,interview_template_id,title,description",
            })
            if jobs:
                job = jobs[0]
                context["company_id"] = job.get("company_id")
                context["template_id"] = job.get("interview_template_id")
                context["job_title"] = job.get("title", "")
                context["job_description"] = job.get("description", "")
        except Exception as e:
            print(f"Job lookup failed: {e}")

    # 2. Get application → application_id, candidate_id
    if job_id and candidate_id:
        try:
            apps = _request("GET", "job_applications", params={
                "job_id": f"eq.{job_id}",
                "candidate_id": f"eq.{candidate_id}",
                "select": "id,candidate_id",
                "order": "applied_at.desc",
                "limit": "1",
            })
            if apps:
                context["application_id"] = str(apps[0]["id"])
                context["candidate_id"] = str(apps[0]["candidate_id"])
        except Exception as e:
            print(f"Application lookup failed: {e}")

    return context


# ─────────────────────────────────────────────────────────────────────────────
# INTERVIEW SESSIONS
# ─────────────────────────────────────────────────────────────────────────────

def create_interview_template(created_by: str) -> str:
    """Create a dynamic interview template for a live AI session.
    Returns the newly created template UUID."""
    row = {
        "created_by": created_by,
        "name": f"Live AI Interview",
        "interview_type": "live_ai",
        "is_active": True,
    }
    result = _request("POST", "interview_templates", body=row)
    if not result:
        raise Exception("Failed to create interview template")
    return str(result[0]["id"])


def create_interview_question(
    question_text: str,
    template_id: str = None,
    sort_order: int = 0,
) -> str:
    """Create a question row in interview_questions and return its UUID."""
    row = {
        "text": question_text,
        "category": "technical",
        "difficulty": "medium",
        "sort_order": sort_order,
    }
    if template_id:
        row["template_id"] = template_id
    result = _request("POST", "interview_questions", body=row)
    if not result:
        raise Exception("Failed to create interview question")
    return str(result[0]["id"])


def create_session(
    template_id: str = None,
    application_id: str = None,
    candidate_id: str = None,
    company_id: str = None,
) -> dict:
    """Create a new interview session row.
    Auto-creates an interview template if candidate_id is given but no template_id."""

    # Auto-create template so we can later create question rows for FK chain
    if not template_id and candidate_id:
        template_id = create_interview_template(candidate_id)

    row = {
        "interview_type": "live_ai",
        "status": "started",
        "started_at": _now_iso(),
        "session_language": "en",
        "full_transcript": "",
        "invitation_token": str(uuid.uuid4()),
    }

    # candidate_id is NOT NULL with FK to users(id)
    if candidate_id:
        row["candidate_id"] = candidate_id
    if template_id:
        row["template_id"] = template_id
    if application_id:
        row["application_id"] = application_id
    if company_id:
        row["company_id"] = company_id

    result = _request("POST", "interview_sessions", body=row)

    if not result:
        raise Exception("Failed to create interview session")

    created = result[0]
    return {
        "session_id": str(created["id"]),
        "started_at": created.get("started_at"),
        "template_id": template_id,
        "data": created,
    }


def get_session(session_id: str) -> Optional[dict]:
    """Retrieve a session by its UUID id."""
    result = _request("GET", "interview_sessions", params={
        "id": f"eq.{session_id}",
        "select": "*",
    })
    return result[0] if result else None


def update_session_transcript(session_id: str, transcript: str) -> list:
    """Update the full_transcript field."""
    return _request("PATCH", "interview_sessions", 
        params={"id": f"eq.{session_id}"},
        body={"full_transcript": transcript},
    )


def complete_session(session_id: str, summary: dict) -> list:
    """
    Mark session as completed and store final scores + recommendation.
    """
    skill_scores = summary.get("skill_wise_scores", {})

    update_data = {
        "status": "completed",
        "completed_at": _now_iso(),
        "total_duration_seconds": int(summary.get("time_taken_minutes", 0) * 60),
        "overall_score": summary.get("overall_score", 0),
        "technical_score": skill_scores.get("role_specific_knowledge", 0),
        "communication_score": skill_scores.get("communication", 0),
        "behavioral_score": skill_scores.get("confidence", 0),
        "presentation_score": skill_scores.get("clarity", 0),
        "ai_recommendation": _map_recommendation(
            summary.get("final_recommendation", "")
        ),
        "strengths": summary.get("strengths", []),
        "improvement_areas": summary.get("improvement_areas", []),
    }

    return _request("PATCH", "interview_sessions",
        params={"id": f"eq.{session_id}"},
        body=update_data,
    )


def _map_recommendation(rec: str) -> str:
    """Map recommendation text to the DB enum values."""
    rec_lower = rec.lower().strip()
    if "strong" in rec_lower:
        return "strong_hire"
    elif "moderate" in rec_lower or "fit" in rec_lower:
        return "hire"
    elif "needs" in rec_lower or "improvement" in rec_lower:
        return "maybe"
    else:
        return "maybe"


# ─────────────────────────────────────────────────────────────────────────────
# INTERVIEW ANSWERS (per-question)
# ─────────────────────────────────────────────────────────────────────────────

def store_answer(
    session_id: str,
    question_text: str,
    answer_text: str,
    evaluation: dict,
    duration_seconds: int = 0,
    question_id: str = None,
    template_id: str = None,
) -> list:
    """Store a single answer + evaluation in the interview_answers table."""
    dimensions = ["relevance", "depth", "clarity", "communication",
                   "problem_solving", "practical_experience"]
    scores = [evaluation.get(d, 5) for d in dimensions]
    avg_score = int((sum(scores) / len(scores)) * 10) if scores else 50

    content_dims = [evaluation.get("relevance", 5),
                    evaluation.get("depth", 5),
                    evaluation.get("problem_solving", 5)]
    content_score = int((sum(content_dims) / len(content_dims)) * 10)

    delivery_dims = [evaluation.get("clarity", 5),
                     evaluation.get("communication", 5)]
    delivery_score = int((sum(delivery_dims) / len(delivery_dims)) * 10)

    row = {
        "session_id": session_id,
        "question_text_snapshot": question_text,
        "transcript": answer_text,
        "score": avg_score,
        "content_score": content_score,
        "delivery_score": delivery_score,
        "ai_feedback": evaluation.get("short_summary", ""),
        "duration_seconds": duration_seconds,
        "answered_at": _now_iso(),
    }

    if question_id:
        row["question_id"] = question_id

    return _request("POST", "interview_answers", body=row)


def get_answers_for_session(session_id: str) -> List[dict]:
    """Get all answers for a session, ordered by time."""
    return _request("GET", "interview_answers", params={
        "session_id": f"eq.{session_id}",
        "select": "*",
        "order": "answered_at",
    })


# ─────────────────────────────────────────────────────────────────────────────
# INTERVIEW TEMPLATES & QUESTIONS (read-only)
# ─────────────────────────────────────────────────────────────────────────────

def get_template(template_id: str) -> Optional[dict]:
    """Get an interview template by ID."""
    result = _request("GET", "interview_templates", params={
        "id": f"eq.{template_id}",
        "select": "*",
    })
    return result[0] if result else None


def get_template_questions(template_id: str) -> List[dict]:
    """Get all questions for a template, ordered by sort_order."""
    return _request("GET", "interview_questions", params={
        "template_id": f"eq.{template_id}",
        "select": "*",
        "order": "sort_order",
    })
