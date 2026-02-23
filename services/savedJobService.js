// services/savedJobService.js
import supabaseAdmin from "../config/dbAdmin.js";
import { AppError } from "../utils/response.js";

export const getSavedJobs = async (userId) => {
    const { data, error } = await supabaseAdmin
        .from("saved_jobs")
        .select(`
            job_id,
            saved_at,
            jobs(
                *,
                companies(name, logo_url),
                job_required_skills(
                    skills(name)
                )
            )
        `)
        .eq("candidate_id", userId)              // ✅ Fixed
        .order("saved_at", { ascending: false });

    if (error) throw new AppError(error.message, 500);
    return data;
};

export const saveJob = async (userId, jobId) => {
    const { data, error } = await supabaseAdmin
        .from("saved_jobs")
        .insert({ candidate_id: userId, job_id: jobId })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") throw new AppError("Job already saved.", 409);
        throw new AppError(error.message, 500);
    }
    return data;
};

export const unsaveJob = async (userId, jobId) => {
    const { error } = await supabaseAdmin
        .from("saved_jobs")
        .delete()
        .eq("candidate_id", userId)              // ✅ Fixed
        .eq("job_id", jobId);

    if (error) throw new AppError(error.message, 500);
};

// ✅ New: efficient single-row existence check
export const isJobSaved = async (userId, jobId) => {
    const { data, error } = await supabaseAdmin
        .from("saved_jobs")
        .select("id")
        .eq("candidate_id", userId)
        .eq("job_id", jobId)
        .maybeSingle();                          // returns null if not found, no error

    if (error) throw new AppError(error.message, 500);
    return !!data;
};