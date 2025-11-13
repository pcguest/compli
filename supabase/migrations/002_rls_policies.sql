-- Enable Row Level Security on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DOCUMENTS POLICIES
-- ============================================================================

-- Users can only view their own documents (excluding soft-deleted)
CREATE POLICY "Users can view their own active documents"
ON documents FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
);

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents"
ON documents FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own documents (for soft delete, metadata updates)
CREATE POLICY "Users can update their own documents"
ON documents FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own documents (soft delete recommended)
CREATE POLICY "Users can delete their own documents"
ON documents FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- ANALYSIS LOGS POLICIES
-- ============================================================================

-- Users can view their own analysis logs
CREATE POLICY "Users can view their own analysis logs"
ON analysis_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert analysis logs for their documents
CREATE POLICY "Users can create analysis logs"
ON analysis_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own analysis logs (for status updates)
CREATE POLICY "Users can update their own analysis logs"
ON analysis_logs FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- ANALYSIS RESULTS POLICIES
-- ============================================================================

-- Users can view results for their own analyses
CREATE POLICY "Users can view their own analysis results"
ON analysis_results FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM analysis_logs
    WHERE analysis_logs.id = analysis_results.analysis_log_id
    AND analysis_logs.user_id = auth.uid()
  )
);

-- Users can insert results for their own analyses
CREATE POLICY "Users can create analysis results"
ON analysis_results FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM analysis_logs
    WHERE analysis_logs.id = analysis_results.analysis_log_id
    AND analysis_logs.user_id = auth.uid()
  )
);

-- ============================================================================
-- DOCUMENT VERSIONS POLICIES
-- ============================================================================

-- Users can view versions of their own documents
CREATE POLICY "Users can view their document versions"
ON document_versions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
    AND documents.user_id = auth.uid()
  )
);

-- Users can create versions for their own documents
CREATE POLICY "Users can create document versions"
ON document_versions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_versions.document_id
    AND documents.user_id = auth.uid()
  )
);

-- ============================================================================
-- USER PREFERENCES POLICIES
-- ============================================================================

-- Users can view their own preferences
CREATE POLICY "Users can view their own preferences"
ON user_preferences FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own preferences
CREATE POLICY "Users can insert their own preferences"
ON user_preferences FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update their own preferences"
ON user_preferences FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- COMPLIANCE TEMPLATES POLICIES
-- ============================================================================

-- All authenticated users can view active templates
CREATE POLICY "Authenticated users can view active templates"
ON compliance_templates FOR SELECT
TO authenticated
USING (is_active = true);

-- Only admins can manage templates (using custom claims)
-- Note: Implement admin role via Supabase auth custom claims
CREATE POLICY "Admins can manage templates"
ON compliance_templates FOR ALL
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ============================================================================
-- FUNCTIONS FOR COMMON QUERIES
-- ============================================================================

-- Function to get user's document count
CREATE OR REPLACE FUNCTION get_user_document_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM documents
  WHERE user_id = p_user_id
  AND deleted_at IS NULL;
$$;

-- Function to get user's total storage used
CREATE OR REPLACE FUNCTION get_user_storage_bytes(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(size_bytes), 0)
  FROM documents
  WHERE user_id = p_user_id
  AND deleted_at IS NULL;
$$;

-- Function to get user's analysis count this month
CREATE OR REPLACE FUNCTION get_user_monthly_analysis_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM analysis_logs
  WHERE user_id = p_user_id
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE);
$$;

-- ============================================================================
-- USAGE QUOTAS (IMPORTANT FOR MVP)
-- ============================================================================

-- Table to track user quotas
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Storage quotas
  max_storage_bytes BIGINT DEFAULT 524288000, -- 500MB default
  max_documents INTEGER DEFAULT 100,

  -- Analysis quotas
  max_monthly_analyses INTEGER DEFAULT 50,

  -- Feature flags
  can_use_advanced_features BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;

-- Users can view their own quotas
CREATE POLICY "Users can view their own quotas"
ON user_quotas FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Trigger to create default quotas for new users
CREATE OR REPLACE FUNCTION create_user_quota()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_quotas (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_quota();

-- Function to check if user can upload more documents
CREATE OR REPLACE FUNCTION can_user_upload_document(
  p_user_id UUID,
  p_file_size BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_storage BIGINT;
  v_current_count INTEGER;
  v_max_storage BIGINT;
  v_max_documents INTEGER;
BEGIN
  -- Get current usage
  SELECT get_user_storage_bytes(p_user_id) INTO v_current_storage;
  SELECT get_user_document_count(p_user_id) INTO v_current_count;

  -- Get quotas
  SELECT max_storage_bytes, max_documents
  INTO v_max_storage, v_max_documents
  FROM user_quotas
  WHERE user_id = p_user_id;

  -- Check quotas
  IF v_current_storage + p_file_size > v_max_storage THEN
    RETURN false;
  END IF;

  IF v_current_count >= v_max_documents THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Function to check if user can perform analysis
CREATE OR REPLACE FUNCTION can_user_analyse_document(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly_count INTEGER;
  v_max_monthly INTEGER;
BEGIN
  -- Get current monthly usage
  SELECT get_user_monthly_analysis_count(p_user_id) INTO v_monthly_count;

  -- Get quota
  SELECT max_monthly_analyses
  INTO v_max_monthly
  FROM user_quotas
  WHERE user_id = p_user_id;

  IF v_monthly_count >= v_max_monthly THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON TABLE user_quotas IS 'Enforces usage limits for different user tiers';
COMMENT ON FUNCTION can_user_upload_document IS 'Checks if user has quota to upload a document of given size';
COMMENT ON FUNCTION can_user_analyse_document IS 'Checks if user has remaining analysis quota for current month';
