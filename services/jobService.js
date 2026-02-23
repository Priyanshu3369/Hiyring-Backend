// src/services/jobService.js
import supabase from "../config/db.js";
import { AppError } from "../utils/response.js";

/**
 * Fetch all jobs along with their required skills.
 */
export const getAllJobs = async () => {
    const { data, error } = await supabase
        .from("jobs")
        .select(`
            *,
            companies(name, logo_url),
            job_required_skills(
                *,
                skills(name)
            )
        `)
        .eq("status", "published") // Only fetch published jobs
        .order("created_at", { ascending: false });

    if (error) {
        throw new AppError(error.message, 500);
    }

    return data;
};
