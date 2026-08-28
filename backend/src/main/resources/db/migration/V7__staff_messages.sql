CREATE TABLE staff_messages (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_staff_messages_agent ON staff_messages(agent_id, created_at);
