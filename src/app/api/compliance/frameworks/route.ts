import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET: Active frameworks for organization
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active compliance frameworks
    const { data: frameworks, error } = await supabase
      .from('compliance_frameworks')
      .select('*')
      .eq('is_active', true)
      .order('framework_code');

    if (error) throw error;

    return NextResponse.json({ frameworks });
  } catch (error: any) {
    console.error('Error fetching frameworks:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Run compliance assessment
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { framework_code } = body;

    if (!framework_code) {
      return NextResponse.json({
        error: 'framework_code required'
      }, { status: 400 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Get framework requirements
    const { data: framework } = await supabase
      .from('compliance_frameworks')
      .select('*')
      .eq('framework_code', framework_code)
      .single();

    if (!framework) {
      return NextResponse.json({ error: 'Framework not found' }, { status: 404 });
    }

    // Run assessment based on framework
    const assessment = await runComplianceAssessment(
      supabase,
      membership.organization_id,
      framework
    );

    return NextResponse.json({ assessment });
  } catch (error: any) {
    console.error('Error running compliance assessment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Run compliance assessment for a framework
async function runComplianceAssessment(
  supabase: any,
  organizationId: string,
  framework: any
) {
  const results: any = {
    framework_code: framework.framework_code,
    framework_name: framework.framework_name,
    assessed_at: new Date().toISOString(),
    compliance_score: 0,
    max_score: 0,
    findings: [],
    recommendations: [],
  };

  // Australian Privacy Act 1988 Assessment
  if (framework.framework_code === 'au_privacy_act') {
    results.findings = await assessPrivacyAct(supabase, organizationId);
  }

  // Australian Consumer Law Assessment
  if (framework.framework_code === 'au_consumer_law') {
    results.findings = await assessConsumerLaw(supabase, organizationId);
  }

  // Calculate compliance score
  const totalChecks = results.findings.length;
  const passedChecks = results.findings.filter((f: any) => f.compliant).length;

  results.max_score = totalChecks * 100;
  results.compliance_score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  // Generate recommendations for non-compliant findings
  results.recommendations = results.findings
    .filter((f: any) => !f.compliant)
    .map((f: any) => ({
      finding: f.requirement,
      recommendation: f.recommendation,
      priority: f.severity,
    }));

  return results;
}

// Privacy Act 1988 Assessment
async function assessPrivacyAct(supabase: any, organizationId: string) {
  const findings = [];

  // APP 1: Open and transparent management of personal information
  const { data: policies } = await supabase
    .from('byoai_policies')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  findings.push({
    requirement: 'APP 1: Privacy policy exists',
    compliant: policies && policies.length > 0,
    details: `Found ${policies?.length || 0} active policies`,
    severity: 'high',
    recommendation: 'Create privacy policies for AI tool usage',
  });

  // APP 3: Collection of solicited personal information
  const { data: personalInfoUsage } = await supabase
    .from('ai_usage_logs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('contains_personal_info', true)
    .limit(1);

  const hasPersonalInfoPolicy = policies?.some((p: any) =>
    p.rules?.block_personal_info || p.rules?.require_consent_for_personal_info
  );

  findings.push({
    requirement: 'APP 3: Personal information collection controls',
    compliant: !personalInfoUsage || hasPersonalInfoPolicy,
    details: hasPersonalInfoPolicy
      ? 'Policies exist for personal information handling'
      : 'Personal information used without specific policy',
    severity: 'critical',
    recommendation: 'Implement policies to control personal information collection in AI tools',
  });

  // APP 6: Use or disclosure of personal information
  const { data: tools } = await supabase
    .from('ai_tools_registry')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('processes_personal_info', true);

  const approvedPersonalInfoTools = tools?.filter((t: any) => t.approval_status === 'approved') || [];

  findings.push({
    requirement: 'APP 6: Personal information tools approved',
    compliant: tools?.length === approvedPersonalInfoTools.length,
    details: `${approvedPersonalInfoTools.length}/${tools?.length || 0} tools processing personal info are approved`,
    severity: 'high',
    recommendation: 'Ensure all tools processing personal information are properly approved',
  });

  // APP 8: Cross-border disclosure of personal information
  const { data: crossBorderTools } = await supabase
    .from('ai_tools_registry')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('cross_border_disclosure', true);

  const hasCrossBorderPolicy = policies?.some((p: any) => p.rules?.block_cross_border);

  findings.push({
    requirement: 'APP 8: Cross-border data transfer controls',
    compliant: !crossBorderTools?.length || hasCrossBorderPolicy,
    details: crossBorderTools?.length
      ? `${crossBorderTools.length} tools transfer data cross-border`
      : 'No cross-border data transfers detected',
    severity: 'critical',
    recommendation: 'Implement controls for cross-border AI tool usage',
  });

  // APP 11: Security of personal information
  const { data: recentViolations } = await supabase
    .from('compliance_violations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('potential_privacy_breach', true)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  findings.push({
    requirement: 'APP 11: No recent security incidents',
    compliant: !recentViolations || recentViolations.length === 0,
    details: `${recentViolations?.length || 0} potential privacy breaches in last 30 days`,
    severity: 'critical',
    recommendation: 'Review and remediate all security incidents',
  });

  // NDB Scheme: Notifiable Data Breaches
  const { data: reportableViolations } = await supabase
    .from('compliance_violations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('reportable_to_oaic', true)
    .eq('remediation_status', 'pending');

  findings.push({
    requirement: 'NDB: All reportable breaches addressed',
    compliant: !reportableViolations || reportableViolations.length === 0,
    details: `${reportableViolations?.length || 0} reportable breaches pending remediation`,
    severity: 'critical',
    recommendation: 'Immediately address all OAIC-reportable breaches',
  });

  return findings;
}

// Consumer Law Assessment
async function assessConsumerLaw(supabase: any, organizationId: string) {
  const findings = [];

  // Get organization details
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();

  // Transparency requirement
  findings.push({
    requirement: 'ACL: Transparent AI tool usage disclosure',
    compliant: !!org?.compliance_framework,
    details: org?.compliance_framework
      ? `Compliance framework: ${org.compliance_framework}`
      : 'No compliance framework configured',
    severity: 'medium',
    recommendation: 'Document and disclose AI tool usage to stakeholders',
  });

  // Get AI tools
  const { data: tools } = await supabase
    .from('ai_tools_registry')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  // Check for terms of service
  const toolsWithTerms = tools?.filter((t: any) => t.terms_of_service_url) || [];

  findings.push({
    requirement: 'ACL: AI tools have clear terms of service',
    compliant: tools?.length === toolsWithTerms.length,
    details: `${toolsWithTerms.length}/${tools?.length || 0} tools have terms of service documented`,
    severity: 'medium',
    recommendation: 'Ensure all AI tools have documented terms of service',
  });

  return findings;
}
