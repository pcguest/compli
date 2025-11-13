import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';

const UsageLogSchema = z.object({
  tool_id: z.string().uuid(),
  session_id: z.string().optional(),
  request_id: z.string().optional(),
  data_classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  contains_personal_info: z.boolean().default(false),
  contains_sensitive_info: z.boolean().default(false),
  prompt_text: z.string(), // Will be hashed before storage
  prompt_token_count: z.number().int().positive().optional(),
  response_token_count: z.number().int().positive().optional(),
  response_size_bytes: z.number().int().positive().optional(),
  use_case_category: z.string().optional(),
  user_department: z.string().optional(),
  estimated_cost_usd: z.number().optional(),
});

// POST: Log AI usage (with prompt hashing)
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = UsageLogSchema.parse(body);

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Verify tool belongs to organization
    const { data: tool } = await supabase
      .from('ai_tools_registry')
      .select('id, approval_status, tool_name')
      .eq('id', validatedData.tool_id)
      .eq('organization_id', membership.organization_id)
      .single();

    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    // Hash prompt for privacy (never store actual prompts)
    const promptHash = crypto
      .createHash('sha256')
      .update(validatedData.prompt_text)
      .digest('hex');

    // Get client IP and user agent
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    // Check organization policies for violations
    const { data: policies } = await supabase
      .from('byoai_policies')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true);

    let complianceFlags = null;
    let autoBlocked = false;
    let blockReason = null;

    if (policies) {
      const policyCheck = evaluatePolicies(policies, {
        data_classification: validatedData.data_classification,
        contains_personal_info: validatedData.contains_personal_info,
        contains_sensitive_info: validatedData.contains_sensitive_info,
        tool_approval_status: tool.approval_status,
      });

      complianceFlags = policyCheck.violations.length > 0 ? policyCheck.violations : null;
      autoBlocked = policyCheck.shouldBlock;
      blockReason = policyCheck.blockReason;
    }

    // Insert usage log
    const { data: usageLog, error: logError } = await supabase
      .from('ai_usage_logs')
      .insert({
        organization_id: membership.organization_id,
        user_id: user.id,
        tool_id: validatedData.tool_id,
        session_id: validatedData.session_id,
        request_id: validatedData.request_id,
        data_classification: validatedData.data_classification,
        contains_personal_info: validatedData.contains_personal_info,
        contains_sensitive_info: validatedData.contains_sensitive_info,
        prompt_hash: promptHash,
        prompt_token_count: validatedData.prompt_token_count,
        response_token_count: validatedData.response_token_count,
        response_size_bytes: validatedData.response_size_bytes,
        compliance_flags: complianceFlags,
        auto_blocked: autoBlocked,
        block_reason: blockReason,
        user_department: validatedData.user_department,
        use_case_category: validatedData.use_case_category,
        ip_address: ip,
        user_agent: userAgent,
        estimated_cost_usd: validatedData.estimated_cost_usd,
      })
      .select()
      .single();

    if (logError) throw logError;

    // If violations detected, create violation records
    if (complianceFlags && complianceFlags.length > 0) {
      await createViolations(supabase, {
        organization_id: membership.organization_id,
        user_id: user.id,
        tool_id: validatedData.tool_id,
        usage_log_id: usageLog.id,
        violations: complianceFlags,
        auto_blocked: autoBlocked,
      });
    }

    return NextResponse.json({
      logged: true,
      usage_log_id: usageLog.id,
      blocked: autoBlocked,
      block_reason: blockReason,
      compliance_flags: complianceFlags,
      tool_name: tool.tool_name,
    }, { status: autoBlocked ? 403 : 201 });

  } catch (error: any) {
    console.error('Error logging AI usage:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Usage analytics
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '7d'; // 24h, 7d, 30d, 90d
  const tool_id = searchParams.get('tool_id');

  try {
    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Calculate time range
    const periodHours = {
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30,
      '90d': 24 * 90,
    }[period] || 24 * 7;

    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

    // Build query
    let query = supabase
      .from('ai_usage_logs')
      .select('*, ai_tools_registry(tool_name, tool_vendor)')
      .eq('organization_id', membership.organization_id)
      .gte('created_at', since);

    // Non-admins can only see their own usage
    if (!['admin', 'compliance_officer', 'owner'].includes(membership.role)) {
      query = query.eq('user_id', user.id);
    }

    if (tool_id) {
      query = query.eq('tool_id', tool_id);
    }

    const { data: logs, error } = await query
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    // Calculate analytics
    const analytics = {
      total_requests: logs.length,
      blocked_requests: logs.filter(l => l.auto_blocked).length,
      by_classification: {
        public: logs.filter(l => l.data_classification === 'public').length,
        internal: logs.filter(l => l.data_classification === 'internal').length,
        confidential: logs.filter(l => l.data_classification === 'confidential').length,
        restricted: logs.filter(l => l.data_classification === 'restricted').length,
      },
      personal_info_usage: logs.filter(l => l.contains_personal_info).length,
      sensitive_info_usage: logs.filter(l => l.contains_sensitive_info).length,
      violations: logs.filter(l => l.compliance_flags !== null).length,
      total_cost: logs.reduce((sum, l) => sum + (l.estimated_cost_usd || 0), 0),
      total_tokens: logs.reduce((sum, l) =>
        sum + (l.prompt_token_count || 0) + (l.response_token_count || 0), 0
      ),
    };

    return NextResponse.json({ analytics, recent_logs: logs.slice(0, 100) });
  } catch (error: any) {
    console.error('Error fetching usage analytics:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Evaluate policies against usage
function evaluatePolicies(policies: any[], usageData: any) {
  const violations = [];
  let shouldBlock = false;
  let blockReason = null;

  for (const policy of policies) {
    const rules = policy.rules;

    // Check data classification rules
    if (rules.forbidden_data_types?.includes(usageData.data_classification)) {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.policy_name,
        rule_violated: 'forbidden_data_type',
        severity: policy.enforcement_level === 'block' ? 'high' : 'warning',
      });

      if (policy.enforcement_level === 'block') {
        shouldBlock = true;
        blockReason = `Data classification '${usageData.data_classification}' is forbidden by policy '${policy.policy_name}'`;
      }
    }

    // Check personal info rules
    if (rules.block_personal_info && usageData.contains_personal_info) {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.policy_name,
        rule_violated: 'personal_info_blocked',
        severity: 'high',
      });

      if (policy.enforcement_level === 'block') {
        shouldBlock = true;
        blockReason = `Personal information processing blocked by policy '${policy.policy_name}'`;
      }
    }

    // Check tool approval status
    if (rules.require_approved_tools && usageData.tool_approval_status !== 'approved') {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.policy_name,
        rule_violated: 'unapproved_tool',
        severity: 'high',
      });

      if (policy.enforcement_level === 'block') {
        shouldBlock = true;
        blockReason = `Only approved tools are allowed by policy '${policy.policy_name}'`;
      }
    }
  }

  return { violations, shouldBlock, blockReason };
}

// Helper: Create violation records
async function createViolations(supabase: any, data: {
  organization_id: string;
  user_id: string;
  tool_id: string;
  usage_log_id: string;
  violations: any[];
  auto_blocked: boolean;
}) {
  for (const violation of data.violations) {
    await supabase.from('compliance_violations').insert({
      organization_id: data.organization_id,
      user_id: data.user_id,
      tool_id: data.tool_id,
      policy_id: violation.policy_id,
      usage_log_id: data.usage_log_id,
      violation_type: violation.rule_violated,
      severity: violation.severity,
      details: violation,
      remediation_status: data.auto_blocked ? 'acknowledged' : 'pending',
    });
  }
}
