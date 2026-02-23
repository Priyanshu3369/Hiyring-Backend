"""
FastAPI application for the AI Interview Service.
Replaces the n8n webhook with 3 endpoints: start, answer, stop.
Uses EXISTING Supabase tables: interview_sessions, interview_answers.
"""

import json
import time
import io
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage
import PyPDF2

from config import MAX_INTERVIEW_DURATION_MS
from chains import parse_resume, run_interviewer, evaluate_answer, generate_summary
from session_manager import (
    get_application_context,
    create_session,
    create_interview_question,
    get_session,
    update_session_transcript,
    complete_session,
    store_answer,
    get_answers_for_session,
    get_template,
    get_template_questions,
)

app = FastAPI(title="AI Interview Service", version="1.0.0")

# CORS — allow requests from the Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ─────────────────────────────────────────────────

class StartRequest(BaseModel):
    resume: Optional[str] = None          # base64 resume data
    resumeText: Optional[str] = ""        # extracted text from resume
    resumeFileName: Optional[str] = ""
    resumeFormat: Optional[str] = "pdf"
    applicationData: Optional[dict] = None  # { templateId, applicationId, candidateId, companyId, jobDescription }


class AnswerRequest(BaseModel):
    session_id: str
    answer: str


class StopRequest(BaseModel):
    session_id: str


# ── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "AI Interview Service"}


@app.post("/interview/parse-resume")
async def parse_resume_text(file: UploadFile = File(...)):
    """
    Extract text content from an uploaded PDF resume.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        contents = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"

        return {"success": True, "text": text.strip(), "filename": file.filename}
    except Exception as e:
        print(f"PDF parsing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")


# ── 1. START INTERVIEW ──────────────────────────────────────────────────────

@app.post("/interview/start")
async def start_interview(req: StartRequest):
    try:
        resume_text = req.resumeText or ""
        app_data = req.applicationData or {}

        # Get jobId and candidateId from frontend
        job_id = app_data.get("jobId") or app_data.get("templateId")
        candidate_id = app_data.get("candidateId")

        # Fetch real FK data from database (job_applications + jobs tables)
        ctx = get_application_context(job_id, candidate_id)
        template_id   = ctx["template_id"]
        application_id = ctx["application_id"]
        candidate_id   = ctx["candidate_id"] or candidate_id
        company_id     = ctx["company_id"]
        job_description = ctx["job_description"] or app_data.get("jobDescription", "")

        print(f"Application context: job={job_id}, candidate={candidate_id}, "
              f"company={company_id}, template={template_id}, app={application_id}")

        # Parse resume using LLM
        resume_parsed = {}
        if resume_text.strip():
            try:
                resume_parsed = await parse_resume(resume_text)
            except Exception as e:
                print(f"Resume parsing failed: {e}")
                resume_parsed = {
                    "name": "Candidate",
                    "skills": [],
                    "work_experience": [],
                    "education": [],
                }

        # Create session in existing interview_sessions table
        session = create_session(
            template_id=template_id,
            application_id=application_id,
            candidate_id=candidate_id,
            company_id=company_id,
        )

        session_id = session["session_id"]
        session_template_id = session.get("template_id")

        # Generate greeting
        candidate_name = resume_parsed.get("name", "Candidate")
        greeting = f"Hello {candidate_name}! Welcome to the AI Interview. Please briefly introduce yourself and tell me about your background."

        # Store greeting as a question in interview_questions table
        greeting_qid = create_interview_question(
            question_text=greeting,
            template_id=session_template_id,
        )

        # Store resume info, job description, and greeting in transcript
        transcript = f"[SYSTEM] Resume parsed for: {candidate_name}\n"
        transcript += f"[SYSTEM] Job description: {job_description}\n"
        transcript += f"[QID] {greeting_qid}\n"
        transcript += f"[AI] {greeting}\n"
        update_session_transcript(session_id, transcript)

        # Store context in memory for this session (passed back to frontend)
        return {
            "sessionId": session_id,
            "question": greeting,
            "started_at": session["started_at"],
            "status": "running",
            # Pass parsed context back so frontend can send it with each answer
            "_context": {
                "resume_parsed": resume_parsed,
                "resume_text": resume_text,
                "job_description": job_description,
            },
        }

    except Exception as e:
        print(f"Start interview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. ANSWER (Continue Interview) ──────────────────────────────────────────

@app.post("/interview/answer")
async def handle_answer(req: AnswerRequest):
    try:
        # Get session from Supabase
        session_data = get_session(req.session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get all previous answers to reconstruct conversation history
        previous_answers = get_answers_for_session(req.session_id)

        # Calculate timing
        started_at = session_data.get("started_at")
        if started_at:
            if isinstance(started_at, str):
                start_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                start_time_ms = int(start_dt.timestamp() * 1000)
            else:
                start_time_ms = int(time.time() * 1000)
        else:
            start_time_ms = int(time.time() * 1000)

        elapsed_ms = int(time.time() * 1000) - start_time_ms
        time_expired = elapsed_ms > MAX_INTERVIEW_DURATION_MS

        # Determine interview phase based on answer count
        answer_count = len(previous_answers)
        phase = "introduction" if answer_count < 1 else "technical"

        # Build resume summary and job description from transcript
        transcript = session_data.get("full_transcript", "")
        resume_summary = _extract_resume_context(transcript)
        job_description = _extract_job_description(transcript)

        # Build conversation history from TRANSCRIPT (source of truth)
        # The transcript has [AI] and [CANDIDATE] lines in correct order
        history = _build_history_from_transcript(transcript)

        # Check if interview should stop
        stop_interview = time_expired

        # Build conversation messages for LLM memory
        conversation_messages = _build_conversation_messages(history)

        # Run AI Interviewer
        ai_response = await run_interviewer(
            resume=resume_summary,
            job_description=job_description,
            phase=phase,
            history=history,
            stop_interview=stop_interview,
            conversation_messages=conversation_messages,
        )

        ai_question = ai_response.get("question", "")
        ai_feedback = ai_response.get("feedback", "")
        ai_stop = ai_response.get("stop_interview", False)

        # Get the last question from transcript (the one the user is answering NOW)
        last_question = ""
        last_question_id = _extract_last_question_id(transcript)
        if transcript:
            lines = transcript.strip().split("\n")
            for line in reversed(lines):
                if line.startswith("[AI]"):
                    last_question = line.replace("[AI] ", "")
                    break

        # Evaluate the answer
        evaluation = await evaluate_answer(last_question, req.answer)

        # Store answer in interview_answers table (linked to the question)
        store_answer(
            session_id=req.session_id,
            question_text=last_question,
            answer_text=req.answer,
            evaluation=evaluation,
            question_id=last_question_id,
        )

        # Update transcript
        updated_transcript = transcript
        updated_transcript += f"[CANDIDATE] {req.answer}\n"
        if ai_question and not (ai_stop or stop_interview):
            # Store the new AI question in interview_questions table
            new_qid = create_interview_question(
                question_text=ai_question,
                template_id=session_data.get("template_id"),
            )
            updated_transcript += f"[QID] {new_qid}\n"
            updated_transcript += f"[AI] {ai_question}\n"
        update_session_transcript(req.session_id, updated_transcript)

        # Check if interview should stop
        should_stop = ai_stop or stop_interview

        if should_stop:
            # Build full history from the updated transcript (includes current answer)
            updated_transcript_for_summary = transcript + f"[CANDIDATE] {req.answer}\n"
            full_history = _build_history_from_transcript(updated_transcript_for_summary)

            # Generate final summary
            summary = await generate_summary(
                resume=resume_summary,
                job_description=job_description,
                history=full_history,
                start_time=start_time_ms,
            )

            # Store scores in interview_sessions table
            complete_session(req.session_id, summary)

            return {
                "question": None,
                "status": "completed",
                "stop_interview": True,
                "summary": summary,
            }

        # Continue interview
        return {
            "question": ai_question,
            "feedback": ai_feedback,
            "status": "running",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Answer handling error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 3. STOP INTERVIEW ───────────────────────────────────────────────────────

@app.post("/interview/stop")
async def stop_interview(req: StopRequest):
    try:
        session_data = get_session(req.session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found")

        # Build history from transcript (source of truth)
        transcript = session_data.get("full_transcript", "")
        history = _build_history_from_transcript(transcript)
        started_at = session_data.get("started_at")
        if started_at and isinstance(started_at, str):
            start_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            start_time_ms = int(start_dt.timestamp() * 1000)
        else:
            start_time_ms = int(time.time() * 1000)

        transcript = session_data.get("full_transcript", "")
        resume_summary = _extract_resume_context(transcript)
        job_description = _extract_job_description(transcript)

        # Generate final summary
        summary = await generate_summary(
            resume=resume_summary,
            job_description=job_description,
            history=history,
            start_time=start_time_ms,
        )

        # Store scores in interview_sessions table
        complete_session(req.session_id, summary)

        return {
            "question": None,
            "status": "completed",
            "stop_interview": True,
            "summary": summary,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Stop interview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_resume_context(transcript: str) -> str:
    """Extract resume context from the session transcript."""
    if not transcript:
        return "Candidate's resume provided."

    for line in transcript.split("\n"):
        if line.startswith("[SYSTEM] Resume parsed for:"):
            name = line.replace("[SYSTEM] Resume parsed for:", "").strip()
            return f"Candidate: {name}"

    return "Candidate's resume provided."


def _build_history_from_transcript(transcript: str) -> list:
    """Build conversation history from the transcript.
    Parses [AI] and [CANDIDATE] lines in order."""
    history = []
    if not transcript:
        return history

    for line in transcript.strip().split("\n"):
        if line.startswith("[AI] "):
            history.append({
                "type": "question",
                "content": line.replace("[AI] ", ""),
            })
        elif line.startswith("[CANDIDATE] "):
            history.append({
                "type": "answer",
                "content": line.replace("[CANDIDATE] ", ""),
            })
    return history


def _extract_last_question_id(transcript: str) -> str:
    """Extract the last [QID] from the transcript."""
    if not transcript:
        return None
    for line in reversed(transcript.strip().split("\n")):
        if line.startswith("[QID] "):
            return line.replace("[QID] ", "").strip()
    return None


def _extract_job_description(transcript: str) -> str:
    """Extract job description from the session transcript."""
    if not transcript:
        return "Software Engineer role requiring strong technical skills and problem solving."

    for line in transcript.split("\n"):
        if line.startswith("[SYSTEM] Job description:"):
            return line.replace("[SYSTEM] Job description:", "").strip()

    return "Software Engineer role requiring strong technical skills and problem solving."


def _build_conversation_messages(history: list) -> list:
    """
    Convert history array into LangChain messages.
    Replaces n8n's Window Buffer Memory node.
    """
    messages = []
    for entry in history[-10:]:  # Last 10 entries for context window
        content = entry.get("content", "")
        if not content:
            continue
        if entry.get("type") == "question":
            messages.append(AIMessage(content=content))
        elif entry.get("type") == "answer":
            messages.append(HumanMessage(content=content))
    return messages


# ── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
