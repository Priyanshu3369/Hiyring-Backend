"""
LangChain chains for the AI Interview system.
Replicates the 4 AI agents from the n8n workflow:
1. Resume Parser
2. AI Interviewer 
3. Answer Evaluator
4. Summary Generator
"""

import json
import re
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from config import OPENAI_API_KEY, OPENAI_MODEL


def _get_llm(temperature: float = 0.3) -> ChatOpenAI:
    """Get an OpenAI LLM instance."""
    return ChatOpenAI(
        model=OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=temperature,
    )


def _clean_json_response(text: str) -> dict:
    """Clean markdown-wrapped JSON from LLM output and parse it."""
    cleaned = text.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned)
    cleaned = re.sub(r'^```\s*', '', cleaned)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        match = re.search(r'\{[\s\S]*\}', cleaned)
        if match:
            return json.loads(match.group())
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# 1. RESUME PARSER — Equivalent to n8n 'Parse Resume3' agent
# ─────────────────────────────────────────────────────────────────────────────

RESUME_PARSER_SYSTEM = """You are a resume parsing expert. Extract structured information from resumes and output clean JSON only. Be thorough and accurate."""

RESUME_PARSER_PROMPT = """Extract and structure the following resume into a JSON format:

{resume_text}

Extract:
- name: candidate's full name
- contact: object with email and phone
- education: array of degrees with institution and year  
- work_experience: array with company, role, duration, key responsibilities
- skills: array of technical and soft skills
- projects: array of notable projects (if any)
- certifications: array of certifications (if any)

IMPORTANT: Return ONLY valid JSON, no markdown formatting."""


async def parse_resume(resume_text: str) -> dict:
    """Parse resume text into structured JSON using LLM."""
    if not resume_text or not resume_text.strip():
        return {
            "name": "Candidate",
            "skills": [],
            "work_experience": [],
            "education": [],
        }

    llm = _get_llm(temperature=0.1)
    messages = [
        SystemMessage(content=RESUME_PARSER_SYSTEM),
        HumanMessage(content=RESUME_PARSER_PROMPT.format(resume_text=resume_text)),
    ]

    response = await llm.ainvoke(messages)
    return _clean_json_response(response.content)


# ─────────────────────────────────────────────────────────────────────────────
# 2. AI INTERVIEWER — Equivalent to n8n 'AI Agent3' agent
# ─────────────────────────────────────────────────────────────────────────────

INTERVIEWER_SYSTEM = """You are an AI Interviewer conducting structured, one-way interviews for candidate screening.
Your role is to assess candidate suitability for a given role in a fair, consistent, and objective manner.

Behavior & Tone:
- Maintain a calm, professional, and neutral tone at all times.
- Do not provide feedback, hints, or corrections during the interview.
- Do not engage in casual conversation or small talk.
- Be concise and clear when asking questions.
- Never express approval, disapproval, or judgment.

Interview Structure:
- Conduct the interview in a fixed sequence:
  1. Brief introduction of the interview process
  2. Background and experience questions
  3. Role-specific technical or functional questions
  4. Problem-solving or scenario-based questions
  5. Communication and behavioral questions
  6. Closing prompt

- Ask one question at a time.
- Allow the candidate to finish before proceeding.
- Do not interrupt or follow up unless explicitly instructed by the interview logic.

Question Logic:
- Base questions strictly on:
  - The candidate's resume or profile data
  - The job description and required competencies
- If a candidate mentions a skill, project, or tool, ask one clarification or depth question.
- Avoid open-ended rambling prompts; each question must be focused and measurable.

- ADAPTABILITY RULE: If a candidate clearly states they are not aware of, do not have knowledge of, or are not familiar with a specific topic, STOP asking about that topic immediately. Acknowledge it neutrally and move to the next item in the checklist. Do not ask follow-up questions to "test" them further on a gap they have already admitted.

Timing & Constraints:
- Expect answers between 30–120 seconds.
- If the candidate exceeds reasonable time, politely proceed to the next question.
- Do not repeat questions unless the response is completely missing.

Evaluation Rules (Internal Only):
- Internally assess responses on:
  - Relevance to the question
  - Clarity and structure of explanation
  - Depth of understanding
  - Role alignment
- Do not reveal scores, ratings, or evaluation criteria to the candidate.

Bias & Fairness:
- Do not reference age, gender, nationality, accent, appearance, or background.
- Evaluate only the content of responses.
- Treat all candidates equally regardless of communication style.

Failure Handling:
- If the candidate does not respond, wait briefly and then move on.
- If audio/video quality is poor, continue without comment.
- KNOWLEDGE GAPS: If the candidate states they do not know a topic, treat it as a completed assessment for that specific point and move on to the next topic in the checklist.

Restrictions:
- Do not answer candidate questions.
- Do not explain why a question is being asked.
- Do not coach or guide the candidate.

End of Interview:
- Thank the candidate.
- Inform them that results will be reviewed and shared by the hiring team.
- End the session without further interaction.

OUTPUT FORMAT:
Respond ONLY with valid JSON. The 'question' field should contain your full spoken response (Acknowledgement + Question).
{
  "stop_interview": boolean,
  "question": string,
  "feedback": string
}"""

INTERVIEWER_PROMPT = """Context:
Resume: {resume}
Job Description: {job_description}
Phase: {phase}
History: {history}
Task: Conduct the interview based on the required Checklist.
1. Review History to see which Checklist items are already covered.
2. Select the next uncovered item from the Checklist.
3. ACKNOWLEDGE the user's last input naturally.
4. Ask EXACTLY ONE question about the selected item.
5. If all items are covered, you may wrap up or ask a final technical depth question.
Output strictly valid JSON:
{{
  "question": "[Acknowledgement] + [Next Question]",
  "feedback": "Internal feedback on the quality of answer",
  "stop_interview": {stop_interview}
}}"""


async def run_interviewer(
    resume: str,
    job_description: str,
    phase: str,
    history: list,
    stop_interview: bool = False,
    conversation_messages: list = None,
) -> dict:
    """
    Run the AI Interviewer chain.
    Uses conversation history for memory (replaces n8n Window Buffer Memory).
    """
    llm = _get_llm(temperature=0.4)

    messages = [SystemMessage(content=INTERVIEWER_SYSTEM)]

    # Add conversation history as messages (replaces Window Buffer Memory)
    if conversation_messages:
        messages.extend(conversation_messages)

    # Add the current turn
    prompt = INTERVIEWER_PROMPT.format(
        resume=resume,
        job_description=job_description,
        phase=phase,
        history=json.dumps(history[-10:]),  # Last 10 entries to stay within context
        stop_interview=str(stop_interview).lower(),
    )
    messages.append(HumanMessage(content=prompt))

    response = await llm.ainvoke(messages)
    return _clean_json_response(response.content)


# ─────────────────────────────────────────────────────────────────────────────
# 3. ANSWER EVALUATOR — Equivalent to n8n 'Evaluate Answer3' agent
# ─────────────────────────────────────────────────────────────────────────────

EVALUATOR_SYSTEM = """You are an objective interview evaluator. Your role is to assess candidate responses fairly and consistently.

Evaluation Criteria:
- Be objective and data-driven
- Base scores on actual content, not assumptions
- Consider the context of the question
- Be consistent across all candidates
- Recognize that different communication styles are valid

Scoring Guidelines (0-10):
0-3: Poor - Missing key elements, unclear, or off-topic
4-5: Below Average - Partially addresses question, lacks depth
6-7: Average - Adequately addresses question with some detail
8-9: Good - Comprehensive answer with clear examples
10: Excellent - Outstanding depth, clarity, and real-world application

IMPORTANT: Output ONLY valid JSON. No markdown, no explanations."""

EVALUATOR_PROMPT = """Question: {question}

Candidate's Answer: {answer}

Evaluate this answer objectively across the following dimensions (0-10 scale):
- Relevance: How well does the answer address the question?
- Depth: How thorough and detailed is the response?
- Clarity: How clear and well-structured is the communication?
- Communication: Overall communication effectiveness
- Problem Solving: Evidence of analytical thinking and problem-solving ability
- Practical Experience: Demonstration of hands-on experience

Provide a 1-2 line summary of the answer quality.

Return ONLY valid JSON, no markdown:
{{
  "relevance": 0-10,
  "depth": 0-10,
  "clarity": 0-10,
  "communication": 0-10,
  "problem_solving": 0-10,
  "practical_experience": 0-10,
  "short_summary": "1-2 line summary"
}}"""


async def evaluate_answer(question: str, answer: str) -> dict:
    """Evaluate a candidate's answer to a question."""
    if not answer or not answer.strip():
        return {
            "relevance": 0,
            "depth": 0,
            "clarity": 0,
            "communication": 0,
            "problem_solving": 0,
            "practical_experience": 0,
            "short_summary": "No answer provided",
        }

    llm = _get_llm(temperature=0.2)
    messages = [
        SystemMessage(content=EVALUATOR_SYSTEM),
        HumanMessage(content=EVALUATOR_PROMPT.format(question=question, answer=answer)),
    ]

    response = await llm.ainvoke(messages)
    result = _clean_json_response(response.content)

    # Ensure all required fields exist with defaults
    defaults = {
        "relevance": 5, "depth": 5, "clarity": 5,
        "communication": 5, "problem_solving": 5,
        "practical_experience": 5,
        "short_summary": "Unable to evaluate",
    }
    for k, v in defaults.items():
        if k not in result:
            result[k] = v

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 4. SUMMARY GENERATOR — Equivalent to n8n 'Generate Final Summary3' agent
# ─────────────────────────────────────────────────────────────────────────────

SUMMARY_SYSTEM = """You are a senior technical recruiter and interview analyst with expertise in candidate assessment.

Your Analysis Must:
- Be objective and evidence-based
- Reference specific examples from the interview
- Consider both technical skills and soft skills
- Provide actionable feedback
- Be fair and unbiased

Recommendation Guidelines:
- Strong Fit: Overall score 8-10, excellent skill match, clear strengths
- Moderate Fit: Overall score 6-7, good foundation, some gaps
- Needs Improvement: Overall score 0-5, significant gaps or misalignment

IMPORTANT: Output ONLY valid JSON. No markdown, no explanations."""

SUMMARY_PROMPT = """You are conducting a final evaluation of a candidate interview.

Candidate Resume:
{resume}

Job Description:
{job_description}

Interview Session Data:
{history}

Interview Start Time: {start_time}
Current Time: {current_time}

Based on the complete interview conversation and individual answer evaluations embedded in the session data, generate a comprehensive final summary.

Calculate:
1. Time taken in minutes (current time - start time)
2. Average scores across all answer evaluations for each skill dimension
3. Resume match percentage based on how well candidate's experience aligns with job requirements
4. Overall interview score (0-10)
5. Final recommendation

Provide 3-5 specific strengths and 2-4 areas for improvement based on actual responses.

Return ONLY valid JSON:
{{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvement_areas": ["area 1", "area 2"],
  "skill_wise_scores": {{
    "communication": 0-10,
    "problem_solving": 0-10,
    "role_specific_knowledge": 0-10,
    "practical_experience": 0-10,
    "clarity": 0-10,
    "confidence": 0-10
  }},
  "overall_score": 0-10,
  "time_taken_minutes": number,
  "resume_match_percentage": 0-100,
  "final_recommendation": "Strong Fit" | "Moderate Fit" | "Needs Improvement",
  "expected_response_time": "Within 3-5 business days"
}}"""


async def generate_summary(
    resume: str,
    job_description: str,
    history: list,
    start_time: int,
) -> dict:
    """Generate the final interview summary/scorecard."""
    import time as time_mod
    current_time = int(time_mod.time() * 1000)

    llm = _get_llm(temperature=0.3)
    messages = [
        SystemMessage(content=SUMMARY_SYSTEM),
        HumanMessage(content=SUMMARY_PROMPT.format(
            resume=resume,
            job_description=job_description,
            history=json.dumps(history),
            start_time=start_time,
            current_time=current_time,
        )),
    ]

    response = await llm.ainvoke(messages)
    result = _clean_json_response(response.content)

    # Fix time calculation — override LLM's calculation with actual elapsed time
    time_taken_ms = current_time - start_time
    result["time_taken_minutes"] = round(time_taken_ms / 1000 / 60, 1)

    # Ensure all required fields exist
    defaults = {
        "strengths": [],
        "improvement_areas": [],
        "skill_wise_scores": {
            "communication": 5, "problem_solving": 5,
            "role_specific_knowledge": 5, "practical_experience": 5,
            "clarity": 5, "confidence": 5,
        },
        "overall_score": 5,
        "time_taken_minutes": 0,
        "resume_match_percentage": 50,
        "final_recommendation": "Needs Improvement",
        "expected_response_time": "Within 3-5 business days",
    }
    for k, v in defaults.items():
        if k not in result:
            result[k] = v

    return result
