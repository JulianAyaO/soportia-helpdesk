-- n8n stores its own workflow data in a separate database on the same PostgreSQL instance.
CREATE USER n8n WITH PASSWORD 'n8n_local';
CREATE DATABASE n8n OWNER n8n;
