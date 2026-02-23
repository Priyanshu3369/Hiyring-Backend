// controllers/savedJobController.js
import { sendSuccess, sendError } from "../utils/response.js";
import {
    getSavedJobs as fetchSavedJobs,
    saveJob,
    unsaveJob,
    isJobSaved,
} from "../services/savedJobService.js";

export const getSavedJobs = async (req, res, next) => {
    try {
        const savedRows = await fetchSavedJobs(req.user.id);

        const jobs = savedRows.map((row) => ({
            ...row.jobs,
            saved_at: row.saved_at,
        }));

        return sendSuccess(res, "Saved jobs fetched.", jobs);
    } catch (error) {
        next(error);
    }
};

export const toggleSavedJob = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { jobId } = req.params;

        if (!jobId) return sendError(res, "jobId is required.", 400);

        const alreadySaved = await isJobSaved(userId, jobId);

        if (alreadySaved) {
            await unsaveJob(userId, jobId);
            return sendSuccess(res, "Job unsaved.", { saved: false });
        } else {
            await saveJob(userId, jobId);
            return sendSuccess(res, "Job saved.", { saved: true });
        }
    } catch (error) {
        next(error);
    }
};
