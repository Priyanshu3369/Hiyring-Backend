// src/controllers/jobController.js
import { sendSuccess } from "../utils/response.js";
import { getAllJobs } from "../services/jobService.js";

/**
 * Controller to fetch all jobs.
 */
export const getJobs = async (req, res, next) => {
    try {
        const jobs = await getAllJobs();
        return sendSuccess(res, "Jobs fetched successfully.", jobs);
    } catch (error) {
        next(error);
    }
};
