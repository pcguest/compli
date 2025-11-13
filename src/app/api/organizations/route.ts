import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const OrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  abn: z.string().regex(/^\d{11}$/, 'ABN must be 11 digits').optional(),
  industry_sector: z.string().optional(),
  size: z.enum(['micro', 'small', 'medium']).optional(),
  primary_contact_email: z.string().email().optional(),
  primary_contact_name: z.string().optional(),
  subscription_tier: z.enum(['free', 'starter', 'professional', 'enterprise']).optional(),
  byoai_enabled: z.boolean().default(true),
  auto_risk_assessment: z.boolean().default(true),
  compliance_framework: z.string().default('au_privacy_act'),
});

// GET: Fetch organization details with risk score
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user's organization membership
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, role, permissions')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({
        error: 'No organization found. Please create or join an organization.'
      }, { status: 404 });
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single();

    if (orgError) throw orgError;

    // Calculate risk score using database function
    const { data: riskScoreData, error: riskError } = await supabase
      .rpc('calculate_org_risk_score', { p_org_id: membership.organization_id });

    const riskScore = riskError ? 0 : riskScoreData;

    // Get organization stats
    const { count: toolCount } = await supabase
      .from('ai_tools_registry')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true);

    const { count: memberCount } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id);

    const { count: violationCount } = await supabase
      .from('compliance_violations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id)
      .eq('remediation_status', 'pending');

    return NextResponse.json({
      organization,
      membership: {
        role: membership.role,
        permissions: membership.permissions,
      },
      stats: {
        risk_score: riskScore,
        active_tools: toolCount || 0,
        members: memberCount || 0,
        pending_violations: violationCount || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching organization:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create new organization
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = OrganizationSchema.parse(body);

    // Validate ABN if provided (Australian Business Number)
    if (validatedData.abn && !validateABN(validatedData.abn)) {
      return NextResponse.json({
        error: 'Invalid ABN. Please check the Australian Business Number.'
      }, { status: 400 });
    }

    // Check if user already has an organization
    const { data: existingMembership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json({
        error: 'User already belongs to an organization'
      }, { status: 400 });
    }

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        ...validatedData,
        primary_contact_email: validatedData.primary_contact_email || user.email,
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
        permissions: {
          can_approve_tools: true,
          can_create_policies: true,
          can_view_all_usage: true,
        },
      });

    if (memberError) throw memberError;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'organization_created',
      resource_type: 'organization',
      resource_id: organization.id,
      success: true,
      new_values: organization,
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating organization:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update organization settings
export async function PUT(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Get user's organization and check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Only owners and admins can update organization
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({
        error: 'Insufficient permissions'
      }, { status: 403 });
    }

    // Validate ABN if being updated
    if (body.abn && !validateABN(body.abn)) {
      return NextResponse.json({
        error: 'Invalid ABN. Please check the Australian Business Number.'
      }, { status: 400 });
    }

    // Update organization
    const { data: organization, error } = await supabase
      .from('organizations')
      .update(body)
      .eq('id', membership.organization_id)
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'organization_updated',
      resource_type: 'organization',
      resource_id: organization.id,
      success: true,
      new_values: body,
    });

    return NextResponse.json({ organization });
  } catch (error: any) {
    console.error('Error updating organization:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Validate Australian Business Number (ABN)
// ABN validation algorithm: https://abr.business.gov.au/Help/AbnFormat
function validateABN(abn: string): boolean {
  // Remove spaces and check length
  const abnDigits = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(abnDigits)) return false;

  // Apply ABN algorithm
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;

  for (let i = 0; i < 11; i++) {
    let digit = parseInt(abnDigits[i]);
    if (i === 0) digit -= 1; // Subtract 1 from first digit
    sum += digit * weights[i];
  }

  return sum % 89 === 0;
}
