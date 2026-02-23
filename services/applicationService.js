// services/applicationService.js
import supabaseAdmin from "../config/dbAdmin.js";
import { AppError } from "../utils/response.js";

/**
 * Fetch all applications for a candidate, with job + company details.
 */
export const getMyApplications = async (candidateId) => {
    const { data, error } = await supabaseAdmin
        .from("job_applications")
        .select(`
            *,
            jobs(
                *,
                companies(name, logo_url),
                job_required_skills(skills(name))
            )
        `)
        .eq("candidate_id", candidateId)
        .order("applied_at", { ascending: false });

    if (error) throw new AppError(error.message, 500);
    return data;
};

/**
 * Apply for a job (upsert — idempotent).
 */
export const applyForJob = async (candidateId, jobId) => {
    const { data, error } = await supabaseAdmin
        .from("job_applications")
        .upsert(
            {
                job_id: jobId,
                candidate_id: candidateId,
                stage: "applied",
                status: "active",
                applied_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: "job_id,candidate_id" }
        )
        .select()
        .single();

    if (error) throw new AppError(error.message, 500);
    return data;
};
