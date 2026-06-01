ALTER TABLE issue_comments ADD COLUMN parent_comment_id TEXT REFERENCES issue_comments(id);

CREATE INDEX IF NOT EXISTS idx_issue_comments_parent
  ON issue_comments(parent_comment_id);
