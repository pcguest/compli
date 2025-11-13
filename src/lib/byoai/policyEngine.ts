/**
 * Policy Enforcement Engine for BYOAI Compliance Platform
 * Evaluates usage against organizational policies and triggers enforcement actions
 */

export interface Policy {
  id: string;
  organization_id: string;
  policy_name: string;
  policy_type: string;
  rules: Record<string, any>;
  enforcement_level: 'monitor' | 'alert' | 'block';
  auto_remediation: boolean;
  remediation_actions?: Record<string, any>;
  applicable_roles?: string[];
  applicable_departments?: string[];
  applicable_tools?: string[];
  priority: number;
}

export interface Usage {
  tool_id: string;
  tool_approval_status?: string;
  user_role?: string;
  user_department?: string;
  data_classification: 'public' | 'internal' | 'confidential' | 'restricted';
  contains_personal_info: boolean;
  contains_sensitive_info: boolean;
  cross_border?: boolean;
  token_count?: number;
  estimated_cost?: number;
}

export interface PolicyResult {
  allowed: boolean;
  violated_policies: ViolatedPolicy[];
  enforcement_action: 'allow' | 'warn' | 'block';
  warnings: string[];
  auto_remediation_triggered: boolean;
}

export interface ViolatedPolicy {
  policy_id: string;
  policy_name: string;
  policy_type: string;
  rule_violated: string;
  enforcement_level: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  message: string;
}

export interface EnforcementAction {
  action: 'allow' | 'warn' | 'block' | 'remediate';
  message: string;
  details: Record<string, any>;
  notifications_sent: string[];
}

export interface RemediationResult {
  success: boolean;
  actions_taken: string[];
  errors: string[];
}

export interface PolicyReport {
  organization_id: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    total_usage: number;
    blocked_requests: number;
    warnings_issued: number;
    policies_triggered: number;
  };
  policy_effectiveness: PolicyEffectiveness[];
  top_violations: ViolatedPolicy[];
  recommendations: string[];
}

export interface PolicyEffectiveness {
  policy_id: string;
  policy_name: string;
  times_triggered: number;
  times_blocked: number;
  effectiveness_score: number;
}

/**
 * Evaluate usage against all applicable policies
 */
export function evaluatePolicy(policy: Policy, usage: Usage): PolicyResult {
  const violatedPolicies: ViolatedPolicy[] = [];
  const warnings: string[] = [];
  let enforcementAction: 'allow' | 'warn' | 'block' = 'allow';

  // Check if policy applies to this usage
  if (!isPolicyApplicable(policy, usage)) {
    return {
      allowed: true,
      violated_policies: [],
      enforcement_action: 'allow',
      warnings: [],
      auto_remediation_triggered: false,
    };
  }

  // Evaluate each rule type
  const violations = evaluatePolicyRules(policy, usage);

  if (violations.length > 0) {
    violatedPolicies.push(...violations);

    // Determine enforcement action based on policy level
    if (policy.enforcement_level === 'block') {
      enforcementAction = 'block';
    } else if (policy.enforcement_level === 'alert') {
      enforcementAction = 'warn';
      warnings.push(`Policy violation: ${policy.policy_name}`);
    } else {
      warnings.push(`Monitored: ${policy.policy_name}`);
    }
  }

  return {
    allowed: enforcementAction !== 'block',
    violated_policies: violatedPolicies,
    enforcement_action: enforcementAction,
    warnings,
    auto_remediation_triggered: policy.auto_remediation && violations.length > 0,
  };
}

/**
 * Check if policy applies to this usage
 */
function isPolicyApplicable(policy: Policy, usage: Usage): boolean {
  // Check role restrictions
  if (policy.applicable_roles && policy.applicable_roles.length > 0) {
    if (!usage.user_role || !policy.applicable_roles.includes(usage.user_role)) {
      return false;
    }
  }

  // Check department restrictions
  if (policy.applicable_departments && policy.applicable_departments.length > 0) {
    if (!usage.user_department || !policy.applicable_departments.includes(usage.user_department)) {
      return false;
    }
  }

  // Check tool restrictions
  if (policy.applicable_tools && policy.applicable_tools.length > 0) {
    if (!policy.applicable_tools.includes(usage.tool_id)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate policy rules against usage
 */
function evaluatePolicyRules(policy: Policy, usage: Usage): ViolatedPolicy[] {
  const violations: ViolatedPolicy[] = [];
  const rules = policy.rules;

  // Data classification rules
  if (rules.forbidden_data_types && Array.isArray(rules.forbidden_data_types)) {
    if (rules.forbidden_data_types.includes(usage.data_classification)) {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.policy_name,
        policy_type: policy.policy_type,
        rule_violated: 'forbidden_data_type',
        enforcement_level: policy.enforcement_level,
        severity: policy.enforcement_level === 'block' ? 'high' : 'warning',
        message: `Data classification '${usage.data_classification}' is forbidden by this policy`,
      });
    }
  }

  if (rules.allowed_data_types && Array.isArray(rules.allowed_data_types)) {
    if (!rules.allowed_data_types.includes(usage.data_classification)) {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.policy_name,
        policy_type: policy.policy_type,
        rule_violated: 'data_type_not_allowed',
        enforcement_level: policy.enforcement_level,
        severity: 'warning',
        message: `Data classification '${usage.data_classification}' is not in allowed list`,
      });
    }
  }

  // Personal information rules
  if (rules.block_personal_info && usage.contains_personal_info) {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'personal_info_blocked',
      enforcement_level: policy.enforcement_level,
      severity: 'high',
      message: 'Personal information processing is blocked by this policy',
    });
  }

  // Sensitive information rules
  if (rules.block_sensitive_info && usage.contains_sensitive_info) {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'sensitive_info_blocked',
      enforcement_level: policy.enforcement_level,
      severity: 'critical',
      message: 'Sensitive information processing is blocked by this policy',
    });
  }

  // Tool approval rules
  if (rules.require_approved_tools && usage.tool_approval_status !== 'approved') {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'unapproved_tool',
      enforcement_level: policy.enforcement_level,
      severity: 'high',
      message: 'Only approved tools are allowed by this policy',
    });
  }

  // Cross-border rules
  if (rules.block_cross_border && usage.cross_border) {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'cross_border_blocked',
      enforcement_level: policy.enforcement_level,
      severity: 'critical',
      message: 'Cross-border data transfer is blocked by this policy',
    });
  }

  // Usage limit rules
  if (rules.max_token_limit && usage.token_count && usage.token_count > rules.max_token_limit) {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'token_limit_exceeded',
      enforcement_level: policy.enforcement_level,
      severity: 'warning',
      message: `Token count ${usage.token_count} exceeds limit of ${rules.max_token_limit}`,
    });
  }

  // Cost limit rules
  if (rules.require_approval_above_cost && usage.estimated_cost && usage.estimated_cost > rules.require_approval_above_cost) {
    violations.push({
      policy_id: policy.id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      rule_violated: 'cost_approval_required',
      enforcement_level: policy.enforcement_level,
      severity: 'warning',
      message: `Estimated cost $${usage.estimated_cost} requires approval (threshold: $${rules.require_approval_above_cost})`,
    });
  }

  return violations;
}

/**
 * Enforce policy and take appropriate action
 */
export function enforcePolicy(result: PolicyResult): EnforcementAction {
  const notificationsSent: string[] = [];

  if (result.enforcement_action === 'block') {
    return {
      action: 'block',
      message: 'Request blocked due to policy violation',
      details: {
        violated_policies: result.violated_policies,
        reasons: result.violated_policies.map(v => v.message),
      },
      notifications_sent: notificationsSent,
    };
  }

  if (result.enforcement_action === 'warn') {
    return {
      action: 'warn',
      message: 'Request allowed with warnings',
      details: {
        warnings: result.warnings,
        violated_policies: result.violated_policies,
      },
      notifications_sent: notificationsSent,
    };
  }

  return {
    action: 'allow',
    message: 'Request allowed',
    details: {},
    notifications_sent: [],
  };
}

/**
 * Trigger automatic remediation actions
 */
export function triggerAutoRemediation(violation: ViolatedPolicy): RemediationResult {
  const actionsTaken: string[] = [];
  const errors: string[] = [];

  try {
    // Example remediation actions based on violation type
    switch (violation.rule_violated) {
      case 'personal_info_blocked':
        actionsTaken.push('Logged violation to compliance team');
        actionsTaken.push('Sent notification to user');
        break;

      case 'unapproved_tool':
        actionsTaken.push('Blocked tool usage');
        actionsTaken.push('Created approval request');
        break;

      case 'cross_border_blocked':
        actionsTaken.push('Blocked cross-border transfer');
        actionsTaken.push('Notified compliance officer');
        break;

      case 'sensitive_info_blocked':
        actionsTaken.push('Blocked request immediately');
        actionsTaken.push('Created security incident');
        actionsTaken.push('Notified security team');
        break;

      default:
        actionsTaken.push('Logged violation for review');
    }

    return {
      success: true,
      actions_taken: actionsTaken,
      errors: [],
    };
  } catch (error: any) {
    errors.push(error.message);
    return {
      success: false,
      actions_taken: actionsTaken,
      errors,
    };
  }
}

/**
 * Generate policy effectiveness report
 */
export function generatePolicyReport(
  org_id: string,
  policies: Policy[],
  violations: ViolatedPolicy[],
  totalUsage: number,
  blockedCount: number,
  period: { start: string; end: string }
): PolicyReport {
  // Calculate policy effectiveness
  const policyEffectiveness: PolicyEffectiveness[] = policies.map(policy => {
    const triggered = violations.filter(v => v.policy_id === policy.id).length;
    const blocked = violations.filter(
      v => v.policy_id === policy.id && v.enforcement_level === 'block'
    ).length;

    // Effectiveness score: higher when policy prevents violations
    const effectivenessScore = triggered > 0 ? Math.round((blocked / triggered) * 100) : 100;

    return {
      policy_id: policy.id,
      policy_name: policy.policy_name,
      times_triggered: triggered,
      times_blocked: blocked,
      effectiveness_score: effectivenessScore,
    };
  });

  // Get top violations
  const violationCounts = violations.reduce((acc, v) => {
    const key = `${v.policy_id}-${v.rule_violated}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topViolations = violations
    .filter((v, i, arr) => arr.findIndex(x => x.policy_id === v.policy_id && x.rule_violated === v.rule_violated) === i)
    .sort((a, b) => {
      const aKey = `${a.policy_id}-${a.rule_violated}`;
      const bKey = `${b.policy_id}-${b.rule_violated}`;
      return violationCounts[bKey] - violationCounts[aKey];
    })
    .slice(0, 10);

  // Generate recommendations
  const recommendations: string[] = [];

  if (blockedCount > totalUsage * 0.1) {
    recommendations.push('High block rate detected - review policies for over-restriction');
  }

  if (violations.filter(v => v.severity === 'critical').length > 0) {
    recommendations.push('Critical violations detected - immediate review required');
  }

  const ineffectivePolicies = policyEffectiveness.filter(p => p.effectiveness_score < 50);
  if (ineffectivePolicies.length > 0) {
    recommendations.push(`${ineffectivePolicies.length} policies have low effectiveness - consider adjustment`);
  }

  return {
    organization_id: org_id,
    period,
    summary: {
      total_usage: totalUsage,
      blocked_requests: blockedCount,
      warnings_issued: violations.filter(v => v.enforcement_level === 'alert').length,
      policies_triggered: new Set(violations.map(v => v.policy_id)).size,
    },
    policy_effectiveness: policyEffectiveness,
    top_violations: topViolations,
    recommendations,
  };
}
