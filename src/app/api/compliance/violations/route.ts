import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ViolationUpdateSchema = z.object({
  violation_id: z.string().uuid(),
  remediation_status: z.enum([
    'pending',
    'acknowledged',
    'under_investigation',
    'remediated',
    'false_positive',
    'accepted_risk'
  ]).optional(),
  remediation_notes: z.string().optional(),
  remediation_steps: z.record(z.any()).optional(),
});

// GET: Violations dashboard with OAIC reportability flags
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const severity = searchParams.get('severity');
  const status = searchParams.get('status');
  const reportable = searchParams.get('reportable') === 'true';
  const period = searchParams.get('period') || '30d';

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
    const periodDays = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '365d': 365,
      'all': 9999,
    }[period] || 30;

    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    // Build query
    let query = supabase
      .from('compliance_violations')
      .select(`
        *,
        ai_tools_registry(tool_name, tool_vendor),
        byoai_policies(policy_name, policy_type)
      `)
      .eq('organization_id', membership.organization_id)
      .gte('created_at', since);

    // Non-admins can only see their own violations
    if (!['admin', 'compliance_officer', 'owner'].includes(membership.role)) {
      query = query.eq('user_id', user.id);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (status) {
      query = query.eq('remediation_status', status);
    }

    if (reportable) {
      query = query.eq('reportable_to_oaic', true);
    }

    const { data: violations, error } = await query
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    // Calculate summary statistics
    const stats = {
      total: violations.length,
      by_severity: {
        critical: violations.filter(v => v.severity === 'critical').length,
        high: violations.filter(v => v.severity === 'high').length,
        warning: violations.filter(v => v.severity === 'warning').length,
        info: violations.filter(v => v.severity === 'info').length,
      },
      by_status: {
        pending: violations.filter(v => v.remediation_status === 'pending').length,
        acknowledged: violations.filter(v => v.remediation_status === 'acknowledged').length,
        under_investigation: violations.filter(v => v.remediation_status === 'under_investigation').length,
        remediated: violations.filter(v => v.remediation_status === 'remediated').length,
        false_positive: violations.filter(v => v.remediation_status === 'false_positive').length,
        accepted_risk: violations.filter(v => v.remediation_status === 'accepted_risk').length,
      },
      reportable_to_oaic: violations.filter(v => v.reportable_to_oaic).length,
      potential_privacy_breaches: violations.filter(v => v.potential_privacy_breach).length,
      total_affected_individuals: violations.reduce((sum, v) => sum + (v.affected_data_subjects || 0), 0),
    };

    return NextResponse.json({ violations, stats });
  } catch (error: any) {
    console.error('Error fetching violations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create violation (usually called automatically by policy engine)
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Assess if reportable to OAIC
    const reportableToOAIC = assessOAICReportability(body);

    // Insert violation
    const { data: violation, error } = await supabase
      .from('compliance_violations')
      .insert({
        ...body,
        organization_id: membership.organization_id,
        reportable_to_oaic: reportableToOAIC,
      })
      .select()
      .single();

    if (error) throw error;

    // Send notifications if high severity
    if (['high', 'critical'].includes(body.severity) || reportableToOAIC) {
      await sendViolationNotifications(supabase, {
        organization_id: membership.organization_id,
        violation,
      });
    }

    return NextResponse.json({ violation }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating violation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update remediation status
export async function PUT(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = ViolationUpdateSchema.parse(body);

    // Get user's organization and check permissions
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Only compliance officers, admins, and owners can remediate violations
    if (!['owner', 'admin', 'compliance_officer'].includes(membership.role)) {
      return NextResponse.json({
        error: 'Insufficient permissions to remediate violations'
      }, { status: 403 });
    }

    const updates: any = {};
    if (validatedData.remediation_status) {
      updates.remediation_status = validatedData.remediation_status;
      updates.remediated_by = user.id;
      updates.remediated_at = new Date().toISOString();
    }
    if (validatedData.remediation_notes) {
      updates.remediation_notes = validatedData.remediation_notes;
    }
    if (validatedData.remediation_steps) {
      updates.remediation_steps = validatedData.remediation_steps;
    }

    // Update violation
    const { data: violation, error } = await supabase
      .from('compliance_violations')
      .update(updates)
      .eq('id', validatedData.violation_id)
      .eq('organization_id', membership.organization_id)
      .select()
      .single();

    if (error) throw error;

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'violation_remediated',
      resource_type: 'compliance_violation',
      resource_id: violation.id,
      success: true,
      new_values: updates,
    });

    return NextResponse.json({ violation });
  } catch (error: any) {
    console.error('Error updating violation:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Assess if violation is reportable to OAIC
function assessOAICReportability(violation: any): boolean {
  // Under Notifiable Data Breaches (NDB) scheme, must notify OAIC if:
  // 1. Unauthorized access/disclosure of personal information
  // 2. Loss of personal information
  // 3. Likely to result in serious harm

  if (violation.severity === 'critical' && violation.potential_privacy_breach) {
    return true;
  }

  if (violation.affected_data_subjects && violation.affected_data_subjects >= 100) {
    return true;
  }

  if (violation.details?.involves_sensitive_info && violation.severity === 'high') {
    return true;
  }

  return false;
}

// Helper: Send notifications for violations
async function sendViolationNotifications(supabase: any, data: {
  organization_id: string;
  violation: any;
}) {
  try {
    // Get compliance officers and admins
    const { data: officers } = await supabase
      .from('organization_members')
      .select('user_id, auth.users(email)')
      .eq('organization_id', data.organization_id)
      .in('role', ['compliance_officer', 'admin', 'owner']);

    // Mark violation as notified
    await supabase
      .from('compliance_violations')
      .update({
        admin_notified: true,
        notification_sent_at: new Date().toISOString(),
      })
      .eq('id', data.violation.id);

    // TODO: Integrate with email service (Resend)
    // TODO: Integrate with Slack webhook
    // TODO: Create in-app notifications

  } catch (error) {
    console.error('Error sending violation notifications:', error);
  }
}
