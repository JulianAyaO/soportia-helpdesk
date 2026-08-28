CREATE TABLE ticket_attachments (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  stored_name VARCHAR(80) NOT NULL,
  original_name VARCHAR(200) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments(ticket_id, created_at);
