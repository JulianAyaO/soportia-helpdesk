ALTER TABLE tickets ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tickets ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE tickets ADD CONSTRAINT chk_ticket_impact CHECK (impact BETWEEN 1 AND 3);
ALTER TABLE tickets ADD CONSTRAINT chk_ticket_urgency CHECK (urgency BETWEEN 1 AND 3);
ALTER TABLE tickets ADD CONSTRAINT chk_ticket_status CHECK (
    status IN ('OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CLOSED','CANCELLED')
);
ALTER TABLE tickets ADD CONSTRAINT chk_ticket_priority CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL'));

ALTER TABLE comments
    ADD CONSTRAINT chk_comment_visibility CHECK (visibility IN ('PUBLIC','INTERNAL'));

CREATE INDEX idx_ticket_team_status ON tickets(team_id, status);
CREATE INDEX idx_ticket_priority_status ON tickets(priority, status);
CREATE INDEX idx_ticket_resolution_due ON tickets(status, resolution_due_at);
CREATE INDEX idx_comments_ticket_created ON comments(ticket_id, created_at);
CREATE INDEX idx_history_ticket_created ON ticket_history(ticket_id, created_at);
CREATE UNIQUE INDEX uq_sla_event_per_ticket_type ON sla_events(ticket_id, event_type);
