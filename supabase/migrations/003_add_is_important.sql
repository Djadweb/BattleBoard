ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_important boolean NOT NULL DEFAULT false;
