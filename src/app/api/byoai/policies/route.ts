import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PolicySchema = z.object({
  policy_name: z.string().min(1).max(255),
  policy_description: z.string().optional(),
  policy_type: z.enum([
    'data_handling',
    'tool_approval',
    'usage_limits',
    'data_classification',
    'industry_specific',
    'privacy_protection',
    'security_requirements'
  ]),
  rules: z.record(z.any()), // Flexible JSON structure
  enforcement_level: z.enum(['monitor', 'alert', 'block']),
  auto_remediation: z.boolean().default(false),
  remediation_actions: z.record(z.any()).optional(),
  applicable_roles: z.array(z.string()).optional(),
  applicable_departments: z.array(z.string()).optional(),
  applicable_tools: z.array(z.string().uuid()).optional(),
  priority: z.number().int().default(100),
  effective_from: z.string().optional(),
  effective_until: z.string().optional(),
});

// GET: Active policies by organization
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const policy_type = searchParams.get('type');
  const templates = searchParams.get('templates') === 'true';

  try {
    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership && !templates) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // If requesting templates, return industry-specific templates
    if (templates) {
      const policyTemplates = getPolicyTemplates();
      return NextResponse.json({ templates: policyTemplates });
    }

    // Build query for organization policies
    let query = supabase
      .from('byoai_policies')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true);

    if (policy_type) {
      query = query.eq('policy_type', policy_type);
    }

    const { data: policies, error } = await query
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ policies });
  } catch (error: any) {
    console.error('Error fetching policies:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create policy with JSON rules
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = PolicySchema.parse(body);

    // Get user's organization and check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role, permissions')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check if user can create policies
    const canCreatePolicies = ['owner', 'admin', 'compliance_officer'].includes(membership.role) ||
                              membership.permissions?.can_create_policies;

    if (!canCreatePolicies) {
      return NextResponse.json({
        error: 'Insufficient permissions to create policies'
      }, { status: 403 });
    }

    // Validate policy rules
    const validationResult = validatePolicyRules(validatedData.rules, validatedData.policy_type);
    if (!validationResult.valid) {
      return NextResponse.json({
        error: 'Invalid policy rules',
        details: validationResult.errors
      }, { status: 400 });
    }

    // Insert policy
    const { data: policy, error } = await supabase
      .from('byoai_policies')
      .insert({
        ...validatedData,
        organization_id: membership.organization_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'policy_created',
      resource_type: 'byoai_policy',
      resource_id: policy.id,
      success: true,
      new_values: policy,
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating policy:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update enforcement level or rules
export async function PUT(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { policy_id, ...updates } = body;

    if (!policy_id) {
      return NextResponse.json({ error: 'policy_id required' }, { status: 400 });
    }

    // Get user's organization and check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role, permissions')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const canUpdatePolicies = ['owner', 'admin', 'compliance_officer'].includes(membership.role) ||
                              membership.permissions?.can_create_policies;

    if (!canUpdatePolicies) {
      return NextResponse.json({
        error: 'Insufficient permissions to update policies'
      }, { status: 403 });
    }

    // Update policy
    const { data: policy, error } = await supabase
      .from('byoai_policies')
      .update(updates)
      .eq('id', policy_id)
      .eq('organization_id', membership.organization_id)
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'policy_updated',
      resource_type: 'byoai_policy',
      resource_id: policy.id,
      success: true,
      new_values: updates,
    });

    return NextResponse.json({ policy });
  } catch (error: any) {
    console.error('Error updating policy:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Validate policy rules based on policy type
function validatePolicyRules(rules: any, policyType: string): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!rules || typeof rules !== 'object') {
    return { valid: false, errors: ['Rules must be a valid object'] };
  }

  // Type-specific validation
  switch (policyType) {
    case 'data_handling':
      if (rules.allowed_data_types && !Array.isArray(rules.allowed_data_types)) {
        errors.push('allowed_data_types must be an array');
      }
      if (rules.forbidden_data_types && !Array.isArray(rules.forbidden_data_types)) {
        errors.push('forbidden_data_types must be an array');
      }
      break;

    case 'tool_approval':
      if (rules.require_approved_tools !== undefined && typeof rules.require_approved_tools !== 'boolean') {
        errors.push('require_approved_tools must be a boolean');
      }
      break;

    case 'usage_limits':
      if (rules.max_token_limit && typeof rules.max_token_limit !== 'number') {
        errors.push('max_token_limit must be a number');
      }
      if (rules.max_daily_requests && typeof rules.max_daily_requests !== 'number') {
        errors.push('max_daily_requests must be a number');
      }
      break;

    case 'privacy_protection':
      if (rules.block_personal_info !== undefined && typeof rules.block_personal_info !== 'boolean') {
        errors.push('block_personal_info must be a boolean');
      }
      if (rules.block_cross_border !== undefined && typeof rules.block_cross_border !== 'boolean') {
        errors.push('block_cross_border must be a boolean');
      }
      break;
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

// Helper: Get industry-specific policy templates
function getPolicyTemplates() {
  return [
    {
      name: 'Australian Privacy Act Compliance',
      description: 'Ensures AI tools comply with Privacy Act 1988 requirements',
      policy_type: 'privacy_protection',
      enforcement_level: 'block',
      rules: {
        block_personal_info_external: true,
        block_sensitive_info_external: true,
        require_data_classification: true,
        block_cross_border: true,
        require_consent_tracking: true,
        max_data_retention_days: 2555, // 7 years
      },
      applicable_to: ['All industries'],
    },
    {
      name: 'Healthcare Data Protection',
      description: 'HIPAA-equivalent protections for Australian healthcare',
      policy_type: 'data_handling',
      enforcement_level: 'block',
      rules: {
        forbidden_data_types: ['restricted'],
        allowed_data_types: ['public'],
        block_personal_info: true,
        block_sensitive_info: true,
        require_encryption: true,
        require_audit_trail: true,
      },
      applicable_to: ['Healthcare', 'Medical'],
    },
    {
      name: 'Financial Services Compliance',
      description: 'APRA and ASIC compliance for financial institutions',
      policy_type: 'industry_specific',
      enforcement_level: 'block',
      rules: {
        forbidden_data_types: ['restricted', 'confidential'],
        require_approved_tools: true,
        block_cross_border: true,
        max_data_retention_days: 2555,
        require_mfa: true,
        block_public_llms: true,
      },
      applicable_to: ['Finance', 'Banking', 'Insurance'],
    },
    {
      name: 'Retail & E-commerce Standard',
      description: 'Consumer protection and data handling for retail',
      policy_type: 'data_handling',
      enforcement_level: 'alert',
      rules: {
        allowed_data_types: ['public', 'internal'],
        require_consent_for_personal_info: true,
        max_daily_requests: 10000,
        require_data_minimization: true,
      },
      applicable_to: ['Retail', 'E-commerce'],
    },
    {
      name: 'SME Basic Protection',
      description: 'Essential AI governance for small businesses',
      policy_type: 'tool_approval',
      enforcement_level: 'monitor',
      rules: {
        require_approved_tools: false,
        alert_on_personal_info: true,
        max_monthly_cost: 1000,
        require_data_classification: true,
      },
      applicable_to: ['All SMEs'],
    },
    {
      name: 'Cross-Border Data Transfer Block',
      description: 'Prevents data transfer outside Australia',
      policy_type: 'privacy_protection',
      enforcement_level: 'block',
      rules: {
        block_cross_border: true,
        allowed_regions: ['AU', 'ANZ'],
        require_data_residency_au: true,
      },
      applicable_to: ['Government', 'Healthcare', 'Finance'],
    },
  ];
}
