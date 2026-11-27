ALTER TABLE clients ADD COLUMN search TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_clients_status ON clients(status);
