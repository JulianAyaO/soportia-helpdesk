ALTER TABLE staff_messages ADD COLUMN ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;
CREATE INDEX idx_staff_messages_ticket ON staff_messages(ticket_id);
