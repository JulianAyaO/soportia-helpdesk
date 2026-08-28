CREATE TABLE staff_message_attachments (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES staff_messages(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  stored_name VARCHAR(260) NOT NULL,
  original_name VARCHAR(200) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_staff_message_attachments_message ON staff_message_attachments(message_id);
