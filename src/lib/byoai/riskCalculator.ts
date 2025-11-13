/**
 * Risk Calculation Engine for BYOAI Compliance Platform
 * Calculates risk scores for AI tools and usage patterns
 */

export interface AITool {
  tool_name: string;
  tool_vendor?: string;
  tool_type: 'llm' | 'image_gen' | 'code_assist' | 'data_analysis' | 'chatbot' | 'other';
  deployment_type?: 'cloud' | 'hybrid' | 'on_premise';
  processes_personal_info: boolean;
  processes_sensitive_info: boolean;
  cross_border_disclosure: boolean;
  data_residency?: string;
  privacy_act_compliant?: boolean;
  approval_status?: string;
}

export interface RiskScore {
  overall_risk: number; // 0-100
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: RiskFactor[];
  recommendations: string[];
}

export interface RiskFactor {
  category: string;
  score: number;
  weight: number;
  description: string;
}

export interface DataClassification {
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  contains_personal_info: boolean;
  contains_sensitive_info: boolean;
  confidence: number;
}

export interface ComplianceStatus {
  compliant: boolean;
  violations: string[];
  warnings: string[];
  privacy_act_issues: string[];
}

export interface BorderRisk {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  requires_notification: boolean;
  affected_jurisdictions: string[];
  privacy_act_implications: string[];
}

/**
 * Calculate comprehensive risk score for an AI tool
 */
export function calculateToolRisk(tool: AITool): RiskScore {
  const riskFactors: RiskFactor[] = [];

  // 1. Data Sensitivity Risk (weight: 0.35)
  const dataSensitivityScore = calculateDataSensitivityRisk(tool);
  riskFactors.push({
    category: 'Data Sensitivity',
    score: dataSensitivityScore,
    weight: 0.35,
    description: tool.processes_sensitive_info
      ? 'Tool processes sensitive personal information'
      : tool.processes_personal_info
      ? 'Tool processes personal information'
      : 'Tool handles general data',
  });

  // 2. Deployment Risk (weight: 0.20)
  const deploymentScore = calculateDeploymentRisk(tool);
  riskFactors.push({
    category: 'Deployment',
    score: deploymentScore,
    weight: 0.20,
    description: `${tool.deployment_type || 'unknown'} deployment model`,
  });

  // 3. Cross-Border Risk (weight: 0.25)
  const crossBorderScore = calculateCrossBorderRisk(tool);
  riskFactors.push({
    category: 'Cross-Border Transfer',
    score: crossBorderScore,
    weight: 0.25,
    description: tool.cross_border_disclosure
      ? 'Data transferred outside Australia - APP 8 applies'
      : 'Data remains within Australia',
  });

  // 4. Compliance Risk (weight: 0.15)
  const complianceScore = calculateComplianceRisk(tool);
  riskFactors.push({
    category: 'Compliance',
    score: complianceScore,
    weight: 0.15,
    description: tool.privacy_act_compliant
      ? 'Tool vendor claims Privacy Act compliance'
      : 'Privacy Act compliance not verified',
  });

  // 5. Approval Status Risk (weight: 0.05)
  const approvalScore = calculateApprovalRisk(tool);
  riskFactors.push({
    category: 'Approval Status',
    score: approvalScore,
    weight: 0.05,
    description: `Tool status: ${tool.approval_status || 'pending'}`,
  });

  // Calculate weighted overall risk
  const overallRisk = Math.round(
    riskFactors.reduce((sum, factor) => sum + factor.score * factor.weight, 0)
  );

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (overallRisk >= 75) riskLevel = 'critical';
  else if (overallRisk >= 50) riskLevel = 'high';
  else if (overallRisk >= 25) riskLevel = 'medium';
  else riskLevel = 'low';

  // Generate recommendations
  const recommendations = generateRecommendations(tool, riskFactors, riskLevel);

  return {
    overall_risk: overallRisk,
    risk_level: riskLevel,
    risk_factors: riskFactors,
    recommendations,
  };
}

/**
 * Calculate data sensitivity risk (0-100)
 */
function calculateDataSensitivityRisk(tool: AITool): number {
  let score = 0;

  if (tool.processes_personal_info) score += 40;
  if (tool.processes_sensitive_info) score += 60; // Sensitive info is higher risk

  return Math.min(score, 100);
}

/**
 * Calculate deployment risk (0-100)
 */
function calculateDeploymentRisk(tool: AITool): number {
  const deploymentRisks: Record<string, number> = {
    'on_premise': 10,
    'hybrid': 50,
    'cloud': 70,
  };

  return deploymentRisks[tool.deployment_type || 'cloud'] || 80; // Unknown is highest risk
}

/**
 * Calculate cross-border transfer risk (0-100)
 */
function calculateCrossBorderRisk(tool: AITool): number {
  if (!tool.cross_border_disclosure) return 0;

  let score = 60; // Base score for any cross-border transfer

  // Higher risk if processing personal/sensitive info AND cross-border
  if (tool.processes_personal_info) score += 20;
  if (tool.processes_sensitive_info) score += 20;

  // Check data residency
  if (tool.data_residency && !['AU', 'ANZ'].includes(tool.data_residency)) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Calculate compliance risk (0-100)
 */
function calculateComplianceRisk(tool: AITool): number {
  let score = 50; // Start at medium risk

  if (tool.privacy_act_compliant === false) score += 50;
  if (tool.privacy_act_compliant === true) score -= 30;

  // High-risk vendors
  const highRiskVendors = ['Unknown', 'Unverified'];
  if (tool.tool_vendor && highRiskVendors.includes(tool.tool_vendor)) {
    score += 20;
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Calculate approval status risk (0-100)
 */
function calculateApprovalRisk(tool: AITool): number {
  const approvalRisks: Record<string, number> = {
    'approved': 0,
    'conditional': 30,
    'under_review': 50,
    'pending': 70,
    'restricted': 90,
    'banned': 100,
  };

  return approvalRisks[tool.approval_status || 'pending'] || 70;
}

/**
 * Generate risk-based recommendations
 */
function generateRecommendations(
  tool: AITool,
  riskFactors: RiskFactor[],
  riskLevel: string
): string[] {
  const recommendations: string[] = [];

  if (riskLevel === 'critical') {
    recommendations.push('Immediate review required before production use');
    recommendations.push('Conduct formal Privacy Impact Assessment (PIA)');
  }

  if (tool.cross_border_disclosure && tool.processes_personal_info) {
    recommendations.push('Ensure APP 8 compliance for cross-border disclosure');
    recommendations.push('Document cross-border transfer safeguards');
    recommendations.push('Consider data residency requirements');
  }

  if (tool.processes_sensitive_info) {
    recommendations.push('Implement additional security controls for sensitive data');
    recommendations.push('Ensure proper consent mechanisms are in place');
    recommendations.push('Regular audit of data handling practices');
  }

  if (!tool.privacy_act_compliant) {
    recommendations.push('Verify vendor Privacy Act 1988 compliance');
    recommendations.push('Request data processing agreement from vendor');
  }

  if (tool.deployment_type === 'cloud') {
    recommendations.push('Review cloud provider security certifications');
    recommendations.push('Ensure data encryption in transit and at rest');
  }

  if (tool.approval_status !== 'approved') {
    recommendations.push('Complete formal approval process before widespread use');
  }

  return recommendations;
}

/**
 * Assess data sensitivity of content
 */
export function assessDataSensitivity(content: string): DataClassification {
  let containsPersonalInfo = false;
  let containsSensitiveInfo = false;
  let classification: 'public' | 'internal' | 'confidential' | 'restricted' = 'public';

  // Patterns for Australian personal information
  const patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(\+61|0)[2-478](?:[ -]?[0-9]){8}/g,
    tfn: /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g, // Tax File Number
    medicare: /\b\d{4}[ -]?\d{5}[ -]?\d\b/g, // Medicare number
    abn: /\b\d{2}[ -]?\d{3}[ -]?\d{3}[ -]?\d{3}\b/g, // ABN
    creditCard: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
    address: /\b\d+\s+[A-Za-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl)\b/gi,
  };

  // Check for personal identifiers
  if (patterns.email.test(content) || patterns.phone.test(content) || patterns.address.test(content)) {
    containsPersonalInfo = true;
    classification = 'internal';
  }

  // Check for sensitive identifiers (TFN, Medicare, financial)
  if (patterns.tfn.test(content) || patterns.medicare.test(content) || patterns.creditCard.test(content)) {
    containsSensitiveInfo = true;
    containsPersonalInfo = true;
    classification = 'restricted';
  }

  // Keywords indicating sensitive information
  const sensitiveKeywords = [
    'confidential', 'restricted', 'health', 'medical', 'diagnosis',
    'financial', 'salary', 'wage', 'income', 'tax',
    'criminal', 'conviction', 'offense',
  ];

  const lowerContent = content.toLowerCase();
  if (sensitiveKeywords.some(keyword => lowerContent.includes(keyword))) {
    if (classification === 'public') classification = 'confidential';
    containsPersonalInfo = true;
  }

  // Calculate confidence based on matches
  const totalMatches = Object.values(patterns).reduce(
    (count, pattern) => count + (content.match(pattern)?.length || 0),
    0
  );
  const confidence = Math.min(totalMatches * 0.2 + 0.5, 1.0);

  return {
    classification,
    contains_personal_info: containsPersonalInfo,
    contains_sensitive_info: containsSensitiveInfo,
    confidence,
  };
}

/**
 * Check Privacy Act 1988 compliance
 */
export function checkPrivacyActCompliance(usage: {
  tool: AITool;
  data_classification: string;
  contains_personal_info: boolean;
  contains_sensitive_info: boolean;
}): ComplianceStatus {
  const violations: string[] = [];
  const warnings: string[] = [];
  const privacyActIssues: string[] = [];

  // APP 1: Open and transparent management
  if (!usage.tool.privacy_act_compliant) {
    warnings.push('Tool privacy policy not verified');
  }

  // APP 3: Collection of solicited personal information
  if (usage.contains_personal_info && !usage.tool.privacy_act_compliant) {
    privacyActIssues.push('APP 3: Personal information collection without verified compliance');
  }

  // APP 6: Use or disclosure
  if (usage.contains_personal_info && usage.tool.approval_status !== 'approved') {
    violations.push('Personal information used in unapproved tool');
    privacyActIssues.push('APP 6: Use of personal information in unauthorized system');
  }

  // APP 8: Cross-border disclosure
  if (usage.tool.cross_border_disclosure && usage.contains_personal_info) {
    if (!usage.tool.privacy_act_compliant) {
      violations.push('Cross-border transfer of personal info without adequate safeguards');
      privacyActIssues.push('APP 8: Cross-border disclosure without compliance verification');
    } else {
      warnings.push('Cross-border transfer - ensure APP 8 requirements met');
    }
  }

  // APP 11: Security
  if (usage.contains_sensitive_info && usage.data_classification !== 'restricted') {
    violations.push('Sensitive information not classified as restricted');
    privacyActIssues.push('APP 11: Inadequate security for sensitive information');
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
    privacy_act_issues: privacyActIssues,
  };
}

/**
 * Evaluate cross-border transfer risk
 */
export function evaluateCrossBorderRisk(tool: AITool): BorderRisk {
  if (!tool.cross_border_disclosure) {
    return {
      risk_level: 'low',
      requires_notification: false,
      affected_jurisdictions: ['AU'],
      privacy_act_implications: [],
    };
  }

  const implications: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  // APP 8 always applies to cross-border disclosure
  implications.push('APP 8: Must ensure recipient complies with APPs or is subject to similar law');

  if (tool.processes_personal_info) {
    riskLevel = 'high';
    implications.push('Personal information crosses borders - heightened compliance requirements');
  }

  if (tool.processes_sensitive_info) {
    riskLevel = 'critical';
    implications.push('Sensitive information crosses borders - explicit consent may be required');
    implications.push('Document reasonable steps to ensure overseas recipient complies');
  }

  // Check if jurisdiction is high-risk
  const highRiskJurisdictions = ['CN', 'RU', 'Unknown'];
  const affectedJurisdictions = tool.data_residency ? [tool.data_residency] : ['Unknown'];

  if (affectedJurisdictions.some(j => highRiskJurisdictions.includes(j))) {
    riskLevel = 'critical';
    implications.push('Data transferred to high-risk jurisdiction');
  }

  return {
    risk_level: riskLevel,
    requires_notification: tool.processes_personal_info,
    affected_jurisdictions: affectedJurisdictions,
    privacy_act_implications: implications,
  };
}
