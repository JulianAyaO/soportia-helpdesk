ALTER TABLE ticket_attachments
  ADD COLUMN comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX idx_ticket_attachments_comment ON ticket_attachments(comment_id);
