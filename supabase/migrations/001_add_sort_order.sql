-- Add sort_order column to projects table for card reordering
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_projects_user_status_sort_order 
  ON projects (user_id, status, sort_order);

-- Backfill sort_order for existing projects (order by created_at within each status)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, status ORDER BY created_at ASC) - 1 AS rn
  FROM projects
)
UPDATE projects SET sort_order = ranked.rn FROM ranked WHERE projects.id = ranked.id;
