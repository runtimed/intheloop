-- Add optional project_id column to notebooks table
-- Maps notebooks to collections in the anaconda projects service

ALTER TABLE notebooks ADD COLUMN project_id TEXT;

-- Create index on project_id for efficient querying of notebooks by project
CREATE INDEX IF NOT EXISTS idx_notebooks_project_id ON notebooks(project_id);