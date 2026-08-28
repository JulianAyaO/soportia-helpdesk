ALTER TABLE automation_executions ADD COLUMN duration_ms BIGINT;
CREATE INDEX idx_automation_execution_started ON automation_executions(automation_id, created_at);
