-- ============================================================================
-- COMPREHENSIVE AUDIT LOGGING FOR COMPLIANCE
-- ============================================================================

-- Audit log table: Track all sensitive operations for compliance and security
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who performed the action
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT, -- Denormalized for easier querying
  ip_address INET,
  user_agent TEXT,

  -- What action was performed
  action TEXT NOT NULL, -- upload, delete, analyse, download, share, update_settings, etc.
  resource_type TEXT NOT NULL, -- document, analysis, user_preferences, etc.
  resource_id UUID,

  -- Before and after state (for change tracking)
  old_values JSONB,
  new_values JSONB,

  -- Context
  request_id TEXT, -- For correlating related actions
  session_id TEXT,

  -- Result
  success BOOLEAN NOT NULL,
  error_message TEXT,

  -- Metadata
  metadata JSONB, -- Additional context-specific data

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common audit queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_success ON audit_logs(success) WHERE success = false;

-- Partitioning for long-term audit log management (partition by month)
-- Note: Implement partitioning if logs grow large
-- CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Enable RLS (only admins and the user can view their own logs)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Only system can insert audit logs (via triggers or service role)
CREATE POLICY "Service role can insert audit logs"
ON audit_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================================
-- AUDIT TRIGGER FUNCTIONS
-- ============================================================================

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    success,
    error_message,
    metadata
  ) VALUES (
    p_user_id,
    v_user_email,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_values,
    p_new_values,
    p_success,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- Trigger function for document operations
CREATE OR REPLACE FUNCTION audit_document_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action := 'document_upload';
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_action := 'document_soft_delete';
    ELSE
      v_action := 'document_update';
    END IF;
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'document_hard_delete';
    v_old_values := to_jsonb(OLD);
  END IF;

  -- Create audit log (async, don't block the operation)
  PERFORM create_audit_log(
    COALESCE(NEW.user_id, OLD.user_id),
    v_action,
    'document',
    COALESCE(NEW.id, OLD.id),
    v_old_values,
    v_new_values,
    true,
    NULL,
    jsonb_build_object(
      'file_name', COALESCE(NEW.file_name, OLD.file_name),
      'mime_type', COALESCE(NEW.mime_type, OLD.mime_type)
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for analysis operations
CREATE OR REPLACE FUNCTION audit_analysis_operations()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'analysis_started';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.analysis_status = 'completed' AND OLD.analysis_status != 'completed' THEN
      v_action := 'analysis_completed';
    ELSIF NEW.analysis_status = 'failed' THEN
      v_action := 'analysis_failed';
    ELSE
      v_action := 'analysis_updated';
    END IF;
  END IF;

  PERFORM create_audit_log(
    NEW.user_id,
    v_action,
    'analysis',
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW),
    NEW.analysis_status != 'failed',
    NEW.error_message,
    jsonb_build_object(
      'model_used', NEW.model_used,
      'file_id', NEW.file_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers
CREATE TRIGGER audit_documents_trigger
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION audit_document_changes();

CREATE TRIGGER audit_analysis_trigger
  AFTER INSERT OR UPDATE ON analysis_logs
  FOR EACH ROW EXECUTE FUNCTION audit_analysis_operations();

-- ============================================================================
-- DATA RETENTION AND CLEANUP
-- ============================================================================

-- Table to manage data retention policies
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  resource_type TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL,
  auto_cleanup_enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default retention policies (Australian legal requirements often need 7 years)
INSERT INTO data_retention_policies (resource_type, retention_days, auto_cleanup_enabled)
VALUES
  ('audit_logs', 2555, true),  -- 7 years for compliance
  ('analysis_logs', 2555, true),  -- 7 years
  ('soft_deleted_documents', 30, true),  -- 30 days before hard delete
  ('chat_sessions', 365, false);  -- 1 year, manual cleanup

-- Function to cleanup old soft-deleted documents
CREATE OR REPLACE FUNCTION cleanup_soft_deleted_documents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
  v_retention_days INTEGER;
BEGIN
  -- Get retention policy
  SELECT retention_days INTO v_retention_days
  FROM data_retention_policies
  WHERE resource_type = 'soft_deleted_documents'
  AND auto_cleanup_enabled = true;

  -- Delete old soft-deleted documents
  WITH deleted AS (
    DELETE FROM documents
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (v_retention_days || ' days')::INTERVAL
    RETURNING *
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN v_deleted_count;
END;
$$;

-- Function to archive old audit logs (move to separate archive table)
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archived_count INTEGER;
  v_retention_days INTEGER;
BEGIN
  -- Get retention policy
  SELECT retention_days INTO v_retention_days
  FROM data_retention_policies
  WHERE resource_type = 'audit_logs'
  AND auto_cleanup_enabled = true;

  -- For MVP, we'll just count old logs
  -- In production, move to archive storage
  SELECT COUNT(*) INTO v_archived_count
  FROM audit_logs
  WHERE created_at < NOW() - (v_retention_days || ' days')::INTERVAL;

  -- TODO: Implement archival to separate cold storage

  RETURN v_archived_count;
END;
$$;

-- ============================================================================
-- SECURITY EVENT MONITORING
-- ============================================================================

-- Table for security events that need immediate attention
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  event_type TEXT NOT NULL, -- failed_login, suspicious_upload, quota_violation, etc.
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,

  description TEXT NOT NULL,
  metadata JSONB,

  -- Investigation tracking
  investigated BOOLEAN DEFAULT false,
  investigated_by UUID REFERENCES auth.users(id),
  investigated_at TIMESTAMPTZ,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_security_events_severity ON security_events(severity, investigated) WHERE NOT investigated;
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view security events
CREATE POLICY "Admins can view security events"
ON security_events FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Function to log security event
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_severity TEXT,
  p_user_id UUID,
  p_description TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO security_events (
    event_type,
    severity,
    user_id,
    description,
    metadata
  ) VALUES (
    p_event_type,
    p_severity,
    p_user_id,
    p_description,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  -- TODO: Trigger real-time alert for high/critical events
  -- Could integrate with webhooks, email, or monitoring service

  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- COMPLIANCE REPORTING VIEWS
-- ============================================================================

-- View for compliance reporting: Document activity summary
CREATE OR REPLACE VIEW v_document_activity_summary AS
SELECT
  u.id AS user_id,
  u.email AS user_email,
  COUNT(DISTINCT d.id) AS total_documents,
  SUM(d.size_bytes) AS total_storage_bytes,
  COUNT(DISTINCT al.id) AS total_analyses,
  MAX(d.created_at) AS last_upload_at,
  MAX(al.created_at) AS last_analysis_at
FROM auth.users u
LEFT JOIN documents d ON d.user_id = u.id AND d.deleted_at IS NULL
LEFT JOIN analysis_logs al ON al.user_id = u.id
GROUP BY u.id, u.email;

-- View for analysis cost tracking
CREATE OR REPLACE VIEW v_analysis_cost_summary AS
SELECT
  DATE_TRUNC('month', created_at) AS month,
  user_id,
  model_used,
  COUNT(*) AS analysis_count,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(completion_tokens) AS total_completion_tokens
FROM analysis_logs
WHERE analysis_status = 'completed'
GROUP BY DATE_TRUNC('month', created_at), user_id, model_used;

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system operations';
COMMENT ON TABLE security_events IS 'High-priority security events requiring investigation';
COMMENT ON TABLE data_retention_policies IS 'Configurable data retention rules for compliance';
COMMENT ON FUNCTION cleanup_soft_deleted_documents IS 'Scheduled cleanup of documents past retention period';
