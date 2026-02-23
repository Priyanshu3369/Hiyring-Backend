// controllers/applicationController.js
import { sendSuccess, sendError } from "../utils/response.js";
import {
    getMyApplications,
    applyForJob,
} from "../services/applicationService.js";

export const getApplications = async (req, res, next) => {
    try {
        const rows = await getMyApplications(req.user.id);

        const applications = rows.map((row) => ({
            id: row.id,
            jobId: row.job_id,
            stage: row.stage,
            status: row.status,
            appliedAt: row.applied_at,
            job: row.jobs
                ? {
                    ...row.jobs,
                    company: row.jobs.companies?.name,
                    logo: row.jobs.companies?.logo_url,
                    tags: row.jobs.job_required_skills?.map(
                        (s) => s.skills?.name
                    ).filter(Boolean),
                }
                : null,
        }));

        return sendSuccess(res, "Applications fetched.", applications);
    } catch (error) {
        next(error);
    }
};

export const createApplication = async (req, res, next) => {
    try {
        const { jobId } = req.body;
        if (!jobId) return sendError(res, "jobId is required.", 400);

        const application = await applyForJob(req.user.id, jobId);
        return sendSuccess(res, "Application submitted.", application, 201);
    } catch (error) {
        next(error);
    }
};
