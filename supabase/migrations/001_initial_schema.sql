-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Documents table: Store metadata about uploaded documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,

  -- File validation and security
  checksum TEXT, -- SHA-256 hash for integrity verification
  virus_scan_status TEXT CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'failed')),
  virus_scan_at TIMESTAMPTZ,

  -- Document classification
  document_type TEXT, -- contract, invoice, policy, regulation, etc.
  language TEXT DEFAULT 'en-AU',

  -- Soft delete support
  deleted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_size CHECK (size_bytes > 0 AND size_bytes <= 52428800), -- Max 50MB
  CONSTRAINT valid_mime_type CHECK (
    mime_type IN (
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

-- Create indexes for common queries
CREATE INDEX idx_documents_user_id ON documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_document_type ON documents(document_type) WHERE deleted_at IS NULL;

-- Analysis logs: Track all AI analysis requests
CREATE TABLE IF NOT EXISTS analysis_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Model and processing details
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost_usd NUMERIC(10, 6),

  -- Analysis results
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  confidence_score NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Processing time metrics
  processing_time_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_code TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for analytics and monitoring
CREATE INDEX idx_analysis_logs_user_id ON analysis_logs(user_id);
CREATE INDEX idx_analysis_logs_file_id ON analysis_logs(file_id);
CREATE INDEX idx_analysis_logs_created_at ON analysis_logs(created_at DESC);
CREATE INDEX idx_analysis_logs_model_used ON analysis_logs(model_used);

-- Analysis results: Store the actual analysis content
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_log_id UUID NOT NULL REFERENCES analysis_logs(id) ON DELETE CASCADE,

  -- Analysis content
  summary TEXT,
  key_findings JSONB, -- Array of key findings/risks
  compliance_issues JSONB, -- Structured compliance data
  recommendations JSONB, -- Actionable recommendations

  -- Legal-specific extractions
  entities_extracted JSONB, -- Named entities (parties, dates, amounts)
  clauses_identified JSONB, -- Key clauses and their types
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analysis_results_log_id ON analysis_results(analysis_log_id);

-- Document versions: Track document changes over time
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT NOT NULL,

  -- Change tracking
  changed_by UUID REFERENCES auth.users(id),
  change_description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, version_number)
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);

-- User preferences and settings
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification preferences
  email_notifications BOOLEAN DEFAULT true,
  analysis_complete_notifications BOOLEAN DEFAULT true,

  -- Default settings
  default_model TEXT DEFAULT 'claude',
  preferred_language TEXT DEFAULT 'en-AU',

  -- Industry-specific settings
  industry_sector TEXT, -- retail, healthcare, finance, etc.
  business_size TEXT CHECK (business_size IN ('sole_trader', 'small', 'medium', 'enterprise')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance templates: Pre-built analysis templates for common document types
CREATE TABLE IF NOT EXISTS compliance_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL,

  -- Template content
  analysis_prompts JSONB NOT NULL, -- Array of prompts for different aspects
  required_clauses JSONB, -- Clauses that should be present
  risk_factors JSONB, -- Common risk factors to check

  -- Australian law specific
  relevant_legislation JSONB, -- References to relevant AU laws
  industry_specific BOOLEAN DEFAULT false,
  applicable_industries TEXT[],

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_templates_document_type ON compliance_templates(document_type) WHERE is_active = true;

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_templates_updated_at BEFORE UPDATE ON compliance_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE documents IS 'Stores metadata for all uploaded legal documents';
COMMENT ON TABLE analysis_logs IS 'Audit trail of all AI analysis requests for compliance and billing';
COMMENT ON TABLE analysis_results IS 'Stores the detailed results of document analysis';
COMMENT ON TABLE document_versions IS 'Version control for document changes';
COMMENT ON TABLE user_preferences IS 'User-specific settings and preferences';
COMMENT ON TABLE compliance_templates IS 'Reusable analysis templates for common Australian legal documents';
