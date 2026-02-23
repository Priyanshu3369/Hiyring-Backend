-- Add resume_text column to the existing candidate_profiles table
-- The resume_url and resume_uploaded_at columns already exist

ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS resume_text TEXT;
