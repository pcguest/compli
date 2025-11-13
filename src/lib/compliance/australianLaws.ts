/**
 * Australian Compliance Helpers
 * Privacy Act 1988, Consumer Law, Spam Act compliance checking
 */

export interface ComplianceCheck {
  compliant: boolean;
  issues: ComplianceIssue[];
  recommendations: string[];
  legal_references: string[];
}

export interface ComplianceIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  principle: string;
  description: string;
  remediation: string;
}

export interface OAICReport {
  breach_id: string;
  organization_name: string;
  organization_abn?: string;
  report_date: string;
  breach_discovered_date: string;
  breach_occurred_date?: string;
  individuals_affected: number;
  breach_description: string;
  personal_info_involved: string[];
  sensitive_info_involved: boolean;
  likely_harm: string;
  harm_mitigation_steps: string[];
  individuals_notified: boolean;
  notification_method?: string;
  remedial_actions: string[];
  contact_person: string;
  contact_email: string;
}

/**
 * Check Privacy Act 1988 compliance
 */
export function checkPrivacyAct1988(data: {
  has_privacy_policy: boolean;
  collects_personal_info: boolean;
  has_consent_mechanism: boolean;
  cross_border_disclosure: boolean;
  has_security_measures: boolean;
  has_data_breach_response: boolean;
  provides_access_to_data: boolean;
  allows_data_correction: boolean;
}): ComplianceCheck {
  const issues: ComplianceIssue[] = [];
  const recommendations: string[] = [];
  const legalReferences: string[] = [];

  // APP 1: Open and transparent management of personal information
  if (data.collects_personal_info && !data.has_privacy_policy) {
    issues.push({
      severity: 'critical',
      principle: 'APP 1',
      description: 'No privacy policy in place despite collecting personal information',
      remediation: 'Create and publish clear privacy policy outlining personal information handling',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 1');
  }

  // APP 3: Collection of solicited personal information
  if (data.collects_personal_info && !data.has_consent_mechanism) {
    issues.push({
      severity: 'high',
      principle: 'APP 3',
      description: 'No consent mechanism for personal information collection',
      remediation: 'Implement consent collection for personal information gathering',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 3');
    recommendations.push('Document lawful basis for collection');
    recommendations.push('Collect only information reasonably necessary');
  }

  // APP 8: Cross-border disclosure of personal information
  if (data.cross_border_disclosure && data.collects_personal_info) {
    issues.push({
      severity: 'critical',
      principle: 'APP 8',
      description: 'Cross-border disclosure of personal information detected',
      remediation: 'Ensure overseas recipient is subject to similar privacy protections or take reasonable steps to ensure compliance',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 8');
    recommendations.push('Document cross-border data flows');
    recommendations.push('Implement data transfer agreements');
    recommendations.push('Assess recipient country privacy laws');
  }

  // APP 11: Security of personal information
  if (data.collects_personal_info && !data.has_security_measures) {
    issues.push({
      severity: 'critical',
      principle: 'APP 11',
      description: 'Inadequate security measures for personal information',
      remediation: 'Implement appropriate technical and organizational measures to protect personal information',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 11');
    recommendations.push('Encrypt data in transit and at rest');
    recommendations.push('Implement access controls and audit logging');
    recommendations.push('Regular security assessments');
  }

  // Notifiable Data Breaches (NDB) Scheme
  if (data.collects_personal_info && !data.has_data_breach_response) {
    issues.push({
      severity: 'high',
      principle: 'NDB Scheme',
      description: 'No data breach response plan in place',
      remediation: 'Develop and implement notifiable data breach response procedures',
    });
    legalReferences.push('Privacy Act 1988 - Part IIIC Notifiable Data Breaches');
    recommendations.push('Establish 30-day breach assessment timeline');
    recommendations.push('Prepare OAIC notification templates');
  }

  // APP 12: Access to personal information
  if (data.collects_personal_info && !data.provides_access_to_data) {
    issues.push({
      severity: 'medium',
      principle: 'APP 12',
      description: 'No mechanism for individuals to access their personal information',
      remediation: 'Implement process for individuals to request access to their data',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 12');
  }

  // APP 13: Correction of personal information
  if (data.collects_personal_info && !data.allows_data_correction) {
    issues.push({
      severity: 'medium',
      principle: 'APP 13',
      description: 'No mechanism for individuals to correct their personal information',
      remediation: 'Implement process for individuals to request correction of their data',
    });
    legalReferences.push('Privacy Act 1988 - Australian Privacy Principle 13');
  }

  return {
    compliant: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
    issues,
    recommendations,
    legal_references: Array.from(new Set(legalReferences)),
  };
}

/**
 * Validate Australian Business Number (ABN)
 */
export function validateABN(abn: string): boolean {
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

/**
 * Check if data breach meets Notifiable Data Breaches criteria
 */
export function checkNotifiableBreachCriteria(incident: {
  unauthorized_access: boolean;
  unauthorized_disclosure: boolean;
  loss_of_data: boolean;
  involves_personal_info: boolean;
  involves_sensitive_info: boolean;
  individuals_affected: number;
  likely_harm_level: 'none' | 'low' | 'medium' | 'high' | 'serious';
  security_breach: boolean;
}): boolean {
  // Must be an eligible data breach:
  // 1. Unauthorized access OR unauthorized disclosure OR loss of personal information
  const isEligibleBreach =
    (incident.unauthorized_access || incident.unauthorized_disclosure || incident.loss_of_data) &&
    incident.involves_personal_info;

  if (!isEligibleBreach) return false;

  // 2. Likely to result in serious harm to individuals
  const likelySeriousHarm =
    incident.likely_harm_level === 'serious' ||
    incident.involves_sensitive_info ||
    incident.individuals_affected >= 100; // Mass breach threshold

  return likelySeriousHarm;
}

/**
 * Generate OAIC Notifiable Data Breach report
 */
export function generateOAICReport(violations: any[]): OAICReport {
  // Aggregate violation data
  const totalIndividuals = violations.reduce(
    (sum, v) => sum + (v.affected_data_subjects || 0),
    0
  );

  const personalInfoTypes = new Set<string>();
  let involvesSensitiveInfo = false;

  violations.forEach(v => {
    if (v.details?.personal_info_types) {
      v.details.personal_info_types.forEach((t: string) => personalInfoTypes.add(t));
    }
    if (v.details?.involves_sensitive_info) {
      involvesSensitiveInfo = true;
    }
  });

  // Determine likely harm
  let likelyHarm = 'Medium';
  if (involvesSensitiveInfo || totalIndividuals >= 100) {
    likelyHarm = 'Serious - potential for identity theft, financial loss, or significant distress';
  }

  // Compile mitigation steps
  const mitigationSteps = [
    'Immediately blocked unauthorized access',
    'Disabled affected AI tool pending investigation',
    'Initiated forensic investigation',
    'Strengthened access controls and monitoring',
    'Enhanced data encryption measures',
  ];

  // Remedial actions
  const remedialActions = [
    'Conducted full security audit of AI tools',
    'Updated privacy policies and procedures',
    'Provided staff training on data handling',
    'Implemented additional technical safeguards',
    'Enhanced ongoing monitoring and compliance checks',
  ];

  return {
    breach_id: `BR-${Date.now()}`,
    organization_name: '', // To be filled
    organization_abn: undefined,
    report_date: new Date().toISOString(),
    breach_discovered_date: violations[0]?.created_at || new Date().toISOString(),
    breach_occurred_date: violations[0]?.created_at,
    individuals_affected: totalIndividuals,
    breach_description: `Unauthorized access/disclosure of personal information through AI tool usage. ${violations.length} compliance violation(s) detected involving personal data.`,
    personal_info_involved: Array.from(personalInfoTypes),
    sensitive_info_involved: involvesSensitiveInfo,
    likely_harm: likelyHarm,
    harm_mitigation_steps: mitigationSteps,
    individuals_notified: false, // To be updated
    remedial_actions: remedialActions,
    contact_person: '', // To be filled
    contact_email: '', // To be filled
  };
}

/**
 * Check Spam Act 2003 compliance
 */
export function checkSpamActCompliance(usage: {
  sends_commercial_messages: boolean;
  has_consent_for_messages: boolean;
  includes_unsubscribe_option: boolean;
  includes_sender_info: boolean;
}): boolean {
  if (!usage.sends_commercial_messages) return true;

  // Spam Act requirements:
  // 1. Consent
  // 2. Identify sender
  // 3. Unsubscribe facility

  return (
    usage.has_consent_for_messages &&
    usage.includes_sender_info &&
    usage.includes_unsubscribe_option
  );
}

/**
 * Calculate Privacy Act compliance score (0-100)
 */
export function calculatePrivacyActScore(checks: {
  hasPrivacyPolicy: boolean;
  hasConsentMechanism: boolean;
  hasSecurityMeasures: boolean;
  hasBreachResponse: boolean;
  hasAccessMechanism: boolean;
  hasCorrectionMechanism: boolean;
  crossBorderCompliant: boolean;
  dataMinimization: boolean;
}): number {
  const weights = {
    hasPrivacyPolicy: 15,
    hasConsentMechanism: 15,
    hasSecurityMeasures: 20,
    hasBreachResponse: 15,
    hasAccessMechanism: 10,
    hasCorrectionMechanism: 10,
    crossBorderCompliant: 10,
    dataMinimization: 5,
  };

  let score = 0;
  Object.entries(checks).forEach(([key, value]) => {
    if (value === true) {
      score += weights[key as keyof typeof weights] || 0;
    }
  });

  return score;
}

/**
 * Get relevant Australian legislation for AI use case
 */
export function getRelevantLegislation(useCase: {
  industry: string;
  processes_personal_info: boolean;
  automated_decisions: boolean;
  consumer_facing: boolean;
}): string[] {
  const legislation: string[] = [];

  // Always applicable
  if (useCase.processes_personal_info) {
    legislation.push('Privacy Act 1988');
  }

  // Industry-specific
  switch (useCase.industry) {
    case 'finance':
    case 'banking':
      legislation.push('Australian Securities and Investments Commission Act 2001');
      legislation.push('Banking Act 1959');
      legislation.push('Anti-Money Laundering and Counter-Terrorism Financing Act 2006');
      break;

    case 'healthcare':
    case 'medical':
      legislation.push('My Health Records Act 2012');
      legislation.push('Health Insurance Act 1973');
      legislation.push('Therapeutic Goods Act 1989');
      break;

    case 'telecommunications':
      legislation.push('Telecommunications Act 1997');
      legislation.push('Telecommunications (Interception and Access) Act 1979');
      break;

    case 'retail':
    case 'ecommerce':
      if (useCase.consumer_facing) {
        legislation.push('Australian Consumer Law (Competition and Consumer Act 2010)');
      }
      break;
  }

  // Automated decision-making
  if (useCase.automated_decisions) {
    legislation.push('Privacy Act 1988 - APP 1.3 (Automated Decision Making)');
  }

  // Electronic communications
  if (useCase.consumer_facing) {
    legislation.push('Spam Act 2003');
  }

  return legislation;
}
