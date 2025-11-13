-- ============================================================================
-- BYOAI (Bring Your Own AI) Compliance Platform
-- Specialized schema for Australian SME AI governance
-- ============================================================================

-- Organizations table (multi-tenancy support)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  abn TEXT, -- Australian Business Number
  industry_sector TEXT,
  size TEXT CHECK (size IN ('micro', 'small', 'medium')), -- SME focused

  -- Contact information
  primary_contact_email TEXT,
  primary_contact_name TEXT,

  -- Subscription/tier info
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),

  -- Settings
  byoai_enabled BOOLEAN DEFAULT true,
  auto_risk_assessment BOOLEAN DEFAULT true,
  compliance_framework TEXT DEFAULT 'au_privacy_act', -- Australian Privacy Act 1988

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User organization membership
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'compliance_officer', 'member')),
  permissions JSONB DEFAULT '{"can_approve_tools": false, "can_create_policies": false, "can_view_all_usage": false}'::jsonb,

  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, user_id)
);

-- ============================================================================
-- AI TOOLS REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_tools_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tool identification
  tool_name TEXT NOT NULL,
  tool_vendor TEXT, -- e.g., OpenAI, Anthropic, Google, Microsoft
  tool_type TEXT NOT NULL CHECK (tool_type IN ('llm', 'image_gen', 'code_assist', 'data_analysis', 'chatbot', 'other')),
  version TEXT,

  -- Technical details
  api_endpoint TEXT,
  authentication_method TEXT CHECK (authentication_method IN ('api_key', 'oauth', 'service_account', 'other')),
  deployment_type TEXT CHECK (deployment_type IN ('cloud', 'hybrid', 'on_premise')),

  -- Risk assessment
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB, -- Array of identified risk factors
  last_risk_assessment_at TIMESTAMPTZ,

  -- Approval workflow
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'under_review', 'approved', 'conditional', 'restricted', 'banned')),
  approval_conditions TEXT, -- Conditions for conditional approval
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,

  -- Data handling and compliance
  data_handling_policy JSONB, -- Structured data handling rules
  data_residency TEXT, -- Where data is stored (important for AU compliance)
  processes_personal_info BOOLEAN DEFAULT false,
  processes_sensitive_info BOOLEAN DEFAULT false,

  -- Australian compliance specifics
  privacy_act_compliant BOOLEAN,
  notifiable_data_breaches_policy TEXT,
  cross_border_disclosure BOOLEAN DEFAULT false, -- Critical for Privacy Act

  -- Documentation
  privacy_policy_url TEXT,
  terms_of_service_url TEXT,
  data_processing_agreement_url TEXT,
  compliance_notes TEXT,

  -- Usage controls
  is_active BOOLEAN DEFAULT true,
  max_users INTEGER, -- Limit number of users
  usage_quota_monthly INTEGER, -- Request limit per month

  -- Audit trail
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, tool_name, tool_vendor)
);

-- Indexes for AI tools registry
CREATE INDEX idx_ai_tools_org_status ON ai_tools_registry(organization_id, approval_status);
CREATE INDEX idx_ai_tools_risk ON ai_tools_registry(risk_level) WHERE is_active = true;
CREATE INDEX idx_ai_tools_vendor ON ai_tools_registry(tool_vendor);

-- ============================================================================
-- AI USAGE MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES ai_tools_registry(id) ON DELETE CASCADE,

  -- Session tracking
  session_id TEXT,
  request_id TEXT,

  -- Data classification (critical for compliance)
  data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  contains_personal_info BOOLEAN DEFAULT false,
  contains_sensitive_info BOOLEAN DEFAULT false,

  -- Usage details
  prompt_hash TEXT, -- SHA-256 hash for privacy (never store actual prompts)
  prompt_token_count INTEGER,
  response_token_count INTEGER,
  response_size_bytes INTEGER,

  -- Compliance monitoring
  compliance_flags JSONB, -- Any violations or concerns detected
  auto_blocked BOOLEAN DEFAULT false,
  block_reason TEXT,

  -- Context
  user_department TEXT,
  use_case_category TEXT, -- marketing, operations, customer_service, etc.
  ip_address INET,
  user_agent TEXT,

  -- Cost tracking
  estimated_cost_usd NUMERIC(10, 6),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partitioning for performance (monthly partitions)
-- Indexes for usage logs
CREATE INDEX idx_ai_usage_org_user ON ai_usage_logs(organization_id, user_id);
CREATE INDEX idx_ai_usage_tool ON ai_usage_logs(tool_id, created_at DESC);
CREATE INDEX idx_ai_usage_created ON ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_classification ON ai_usage_logs(data_classification);
CREATE INDEX idx_ai_usage_violations ON ai_usage_logs(organization_id, created_at DESC)
  WHERE compliance_flags IS NOT NULL;

-- ============================================================================
-- BYOAI POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS byoai_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Policy identification
  policy_name TEXT NOT NULL,
  policy_description TEXT,
  policy_type TEXT NOT NULL CHECK (policy_type IN (
    'data_handling',
    'tool_approval',
    'usage_limits',
    'data_classification',
    'industry_specific',
    'privacy_protection',
    'security_requirements'
  )),

  -- Policy rules (flexible JSON structure)
  rules JSONB NOT NULL,
  /* Example rules structure:
  {
    "allowed_data_types": ["public", "internal"],
    "forbidden_data_types": ["restricted"],
    "max_token_limit": 4000,
    "require_approval_above_cost": 10.00,
    "allowed_tools": ["tool_id_1", "tool_id_2"],
    "require_data_classification": true,
    "block_cross_border": true
  }
  */

  -- Enforcement
  enforcement_level TEXT NOT NULL CHECK (enforcement_level IN ('monitor', 'alert', 'block')),
  auto_remediation BOOLEAN DEFAULT false,
  remediation_actions JSONB, -- Automated actions on violation

  -- Scope
  applicable_roles TEXT[], -- Which user roles this applies to
  applicable_departments TEXT[],
  applicable_tools UUID[], -- Specific tool IDs

  -- Priority and conflicts
  priority INTEGER DEFAULT 100, -- Lower = higher priority
  override_policies UUID[], -- Policies this one overrides

  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, policy_name)
);

CREATE INDEX idx_byoai_policies_org_active ON byoai_policies(organization_id, is_active);
CREATE INDEX idx_byoai_policies_type ON byoai_policies(policy_type);

-- ============================================================================
-- COMPLIANCE VIOLATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES ai_tools_registry(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES byoai_policies(id) ON DELETE SET NULL,
  usage_log_id UUID REFERENCES ai_usage_logs(id) ON DELETE SET NULL,

  -- Violation details
  violation_type TEXT NOT NULL, -- data_breach, unauthorized_tool, quota_exceeded, etc.
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),

  details JSONB NOT NULL,
  /* Example details:
  {
    "rule_violated": "No restricted data in external AI",
    "data_classification": "restricted",
    "attempted_action": "Send to ChatGPT",
    "blocked": true,
    "user_notified": true
  }
  */

  -- Impact assessment
  impact_description TEXT,
  affected_data_subjects INTEGER, -- Number of individuals affected
  potential_privacy_breach BOOLEAN DEFAULT false,
  reportable_to_oaic BOOLEAN DEFAULT false, -- Office of Australian Information Commissioner

  -- Remediation
  remediation_status TEXT DEFAULT 'pending' CHECK (remediation_status IN (
    'pending',
    'acknowledged',
    'under_investigation',
    'remediated',
    'false_positive',
    'accepted_risk'
  )),
  remediation_steps JSONB,
  remediation_notes TEXT,
  remediated_by UUID REFERENCES auth.users(id),
  remediated_at TIMESTAMPTZ,

  -- Notifications
  user_notified BOOLEAN DEFAULT false,
  admin_notified BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_violations_org_status ON compliance_violations(organization_id, remediation_status);
CREATE INDEX idx_violations_user ON compliance_violations(user_id, created_at DESC);
CREATE INDEX idx_violations_severity ON compliance_violations(severity, remediation_status);
CREATE INDEX idx_violations_reportable ON compliance_violations(organization_id) WHERE reportable_to_oaic = true;

-- ============================================================================
-- AUSTRALIAN COMPLIANCE FRAMEWORKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_frameworks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  framework_code TEXT UNIQUE NOT NULL, -- au_privacy_act, au_consumer_law, etc.
  framework_name TEXT NOT NULL,
  jurisdiction TEXT DEFAULT 'AU',
  authority TEXT, -- OAIC, ACCC, ASIC, etc.

  description TEXT,
  requirements JSONB NOT NULL, -- Structured compliance requirements

  -- Documentation
  legislation_url TEXT,
  guidance_url TEXT,
  last_updated DATE,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Australian frameworks
INSERT INTO compliance_frameworks (framework_code, framework_name, authority, requirements) VALUES
('au_privacy_act', 'Privacy Act 1988', 'OAIC',
  '{"principles": ["APP1_Open_and_transparent", "APP3_Collection_of_solicited_PI", "APP6_Use_or_disclosure", "APP8_Cross_border_disclosure", "APP11_Security_of_PI", "APP12_Access_to_PI", "APP13_Correction_of_PI"], "requires_data_breach_notification": true}'::jsonb),
('au_consumer_law', 'Australian Consumer Law', 'ACCC',
  '{"prohibits_misleading_conduct": true, "requires_transparent_pricing": true}'::jsonb),
('au_spam_act', 'Spam Act 2003', 'ACMA',
  '{"requires_consent": true, "requires_unsubscribe": true}'::jsonb)
ON CONFLICT (framework_code) DO NOTHING;

-- ============================================================================
-- RISK ASSESSMENT ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES ai_tools_registry(id) ON DELETE CASCADE,

  assessment_type TEXT CHECK (assessment_type IN ('initial', 'periodic', 'incident_triggered', 'manual')),

  -- Risk scores (0-100)
  overall_risk_score INTEGER CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
  data_privacy_risk INTEGER,
  security_risk INTEGER,
  compliance_risk INTEGER,
  operational_risk INTEGER,

  -- Risk factors identified
  risk_factors JSONB,
  mitigation_recommendations JSONB,

  -- Assessment details
  assessed_by UUID REFERENCES auth.users(id),
  assessment_method TEXT, -- automated, manual, hybrid
  evidence JSONB,

  -- Follow-up
  requires_action BOOLEAN DEFAULT false,
  action_items JSONB,
  next_assessment_due DATE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_assessments_tool ON risk_assessments(tool_id, created_at DESC);
CREATE INDEX idx_risk_assessments_score ON risk_assessments(overall_risk_score DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tools_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE byoai_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Organizations: Users can only see their own organizations
CREATE POLICY "Users can view their organizations"
ON organizations FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- Organization members can view members of their org
CREATE POLICY "Members can view org membership"
ON organization_members FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- AI tools: Users can view tools in their organization
CREATE POLICY "Users can view org AI tools"
ON ai_tools_registry FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- AI usage logs: Users see their own usage, admins see all
CREATE POLICY "Users can view relevant usage logs"
ON ai_usage_logs FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  organization_id IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'compliance_officer')
  )
);

-- Policies: Organization members can view
CREATE POLICY "Members can view org policies"
ON byoai_policies FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- Violations: User sees own, admins see all
CREATE POLICY "Users can view relevant violations"
ON compliance_violations FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  organization_id IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'compliance_officer')
  )
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user can approve tools
CREATE OR REPLACE FUNCTION can_user_approve_tools(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = p_user_id
    AND organization_id = p_org_id
    AND role IN ('owner', 'admin', 'compliance_officer')
    AND (permissions->>'can_approve_tools')::boolean = true
  );
END;
$$;

-- Function to calculate organization risk score
CREATE OR REPLACE FUNCTION calculate_org_risk_score(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_tool_risk INTEGER;
  v_violation_count INTEGER;
  v_high_risk_tools INTEGER;
  v_risk_score INTEGER;
BEGIN
  -- Average risk from active tools
  SELECT COALESCE(AVG(
    CASE risk_level
      WHEN 'low' THEN 25
      WHEN 'medium' THEN 50
      WHEN 'high' THEN 75
      WHEN 'critical' THEN 100
    END
  ), 0)::INTEGER
  INTO v_avg_tool_risk
  FROM ai_tools_registry
  WHERE organization_id = p_org_id AND is_active = true;

  -- Count violations in last 30 days
  SELECT COUNT(*)
  INTO v_violation_count
  FROM compliance_violations
  WHERE organization_id = p_org_id
  AND created_at > NOW() - INTERVAL '30 days'
  AND severity IN ('high', 'critical');

  -- Calculate composite score
  v_risk_score := LEAST(100, v_avg_tool_risk + (v_violation_count * 5));

  RETURN v_risk_score;
END;
$$;

-- Trigger to update timestamps
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_tools_updated_at BEFORE UPDATE ON ai_tools_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON byoai_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_tools_registry IS 'Registry of AI tools used within organizations with approval workflow';
COMMENT ON TABLE ai_usage_logs IS 'Comprehensive logging of all AI tool usage for compliance monitoring';
COMMENT ON TABLE byoai_policies IS 'Organization-specific policies for AI tool governance';
COMMENT ON TABLE compliance_violations IS 'Tracking of policy violations and remediation status';
