import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schemas
const AIToolSchema = z.object({
  tool_name: z.string().min(1).max(255),
  tool_vendor: z.string().optional(),
  tool_type: z.enum(['llm', 'image_gen', 'code_assist', 'data_analysis', 'chatbot', 'other']),
  version: z.string().optional(),
  api_endpoint: z.string().url().optional(),
  authentication_method: z.enum(['api_key', 'oauth', 'service_account', 'other']).optional(),
  deployment_type: z.enum(['cloud', 'hybrid', 'on_premise']).optional(),
  processes_personal_info: z.boolean().default(false),
  processes_sensitive_info: z.boolean().default(false),
  data_residency: z.string().optional(),
  cross_border_disclosure: z.boolean().default(false),
  privacy_policy_url: z.string().url().optional(),
  terms_of_service_url: z.string().url().optional(),
  compliance_notes: z.string().optional(),
});

// GET: List all AI tools for user's organization
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const riskLevel = searchParams.get('risk_level');

  try {
    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('ai_tools_registry')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true);

    if (status) {
      query = query.eq('approval_status', status);
    }

    if (riskLevel) {
      query = query.eq('risk_level', riskLevel);
    }

    const { data: tools, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ tools });
  } catch (error: any) {
    console.error('Error fetching AI tools:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Register a new AI tool
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = AIToolSchema.parse(body);

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Calculate initial risk assessment
    const riskLevel = calculateRiskLevel({
      processes_personal_info: validatedData.processes_personal_info,
      processes_sensitive_info: validatedData.processes_sensitive_info,
      cross_border_disclosure: validatedData.cross_border_disclosure,
      deployment_type: validatedData.deployment_type,
    });

    // Insert new tool
    const { data: tool, error } = await supabase
      .from('ai_tools_registry')
      .insert({
        ...validatedData,
        organization_id: membership.organization_id,
        created_by: user.id,
        risk_level: riskLevel,
        approval_status: 'pending',
        last_risk_assessment_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'ai_tool_registered',
      resource_type: 'ai_tool',
      resource_id: tool.id,
      success: true,
      new_values: tool,
    });

    return NextResponse.json({ tool }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering AI tool:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update AI tool (mainly for approval workflow)
export async function PUT(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tool_id, approval_status, approval_conditions, risk_level } = body;

    if (!tool_id) {
      return NextResponse.json({ error: 'tool_id required' }, { status: 400 });
    }

    // Check if user has permission to approve tools
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role, permissions')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const canApprove = ['admin', 'compliance_officer', 'owner'].includes(membership.role) ||
                       membership.permissions?.can_approve_tools;

    if (!canApprove && approval_status) {
      return NextResponse.json({
        error: 'Insufficient permissions to approve tools'
      }, { status: 403 });
    }

    // Update tool
    const updateData: any = {};
    if (approval_status) {
      updateData.approval_status = approval_status;
      updateData.approved_by = user.id;
      updateData.approved_at = new Date().toISOString();
    }
    if (approval_conditions) updateData.approval_conditions = approval_conditions;
    if (risk_level) updateData.risk_level = risk_level;

    const { data: tool, error } = await supabase
      .from('ai_tools_registry')
      .update(updateData)
      .eq('id', tool_id)
      .eq('organization_id', membership.organization_id)
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'ai_tool_updated',
      resource_type: 'ai_tool',
      resource_id: tool.id,
      success: true,
      new_values: updateData,
    });

    return NextResponse.json({ tool });
  } catch (error: any) {
    console.error('Error updating AI tool:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove tool from registry (soft delete)
export async function DELETE(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tool_id = searchParams.get('id');

  if (!tool_id) {
    return NextResponse.json({ error: 'tool_id required' }, { status: 400 });
  }

  try {
    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Soft delete
    const { error } = await supabase
      .from('ai_tools_registry')
      .update({ is_active: false })
      .eq('id', tool_id)
      .eq('organization_id', membership.organization_id);

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'ai_tool_deleted',
      resource_type: 'ai_tool',
      resource_id: tool_id,
      success: true,
    });

    return NextResponse.json({ message: 'Tool deactivated successfully' });
  } catch (error: any) {
    console.error('Error deleting AI tool:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper function to calculate risk level
function calculateRiskLevel(factors: {
  processes_personal_info: boolean;
  processes_sensitive_info: boolean;
  cross_border_disclosure: boolean;
  deployment_type?: string;
}): 'low' | 'medium' | 'high' | 'critical' {
  let riskScore = 0;

  if (factors.processes_personal_info) riskScore += 1;
  if (factors.processes_sensitive_info) riskScore += 2;
  if (factors.cross_border_disclosure) riskScore += 2;
  if (factors.deployment_type === 'cloud') riskScore += 1;

  if (riskScore >= 4) return 'critical';
  if (riskScore >= 3) return 'high';
  if (riskScore >= 1) return 'medium';
  return 'low';
}
