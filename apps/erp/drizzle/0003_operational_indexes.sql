-- Nonunique: multiple historical/manual invoices remain permitted pending BA policy.
CREATE INDEX idx_project_invoices_opportunity_month ON project_invoices (opportunity_id, services_month_start);
CREATE INDEX idx_finance_handoffs_pending ON finance_document_handoffs (status_code, opportunity_id) WHERE status_code IN ('notified','needs_revision');
