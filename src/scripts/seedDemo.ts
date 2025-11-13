/**
 * Demo Data Seeding Script for BYOAI Compliance Platform
 * Run with: npx tsx src/scripts/seedDemo.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Service role key for admin operations

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDemoData() {
  console.log('🌱 Starting demo data seeding...\n');

  try {
    // 1. Get or create a demo user
    console.log('👤 Setting up demo user...');
    const demoEmail = 'demo@compli.example.com';

    // First, check if user already exists
    let demoUserId;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === demoEmail);

    if (existingUser) {
      demoUserId = existingUser.id;
      console.log(`✓ Using existing demo user: ${demoEmail}\n`);
    } else {
      console.log('⚠️  No demo user found. Please create a user first:');
      console.log('   1. Go to your Supabase dashboard');
      console.log('   2. Navigate to Authentication > Users');
      console.log(`   3. Click "Add user" and create: ${demoEmail}`);
      console.log('   4. Run this script again\n');
      console.log('Alternatively, sign up via your app at http://localhost:3000\n');

      // For now, we'll skip user-dependent data
      demoUserId = null;
    }

    // 2. Create demo organizations
    console.log('📊 Creating demo organizations...');
    const organizations = [
      {
        name: 'HealthTech Australia',
        abn: '53004085616', // Valid ABN
        industry_sector: 'healthcare',
        size: 'small',
        primary_contact_email: 'admin@healthtech.example.com',
        subscription_tier: 'professional',
      },
      {
        name: 'FinServe Advisors',
        abn: '51824753556',
        industry_sector: 'finance',
        size: 'medium',
        primary_contact_email: 'compliance@finserve.example.com',
        subscription_tier: 'enterprise',
      },
      {
        name: 'Retail Solutions Co',
        abn: '33102417032',
        industry_sector: 'retail',
        size: 'small',
        primary_contact_email: 'tech@retail.example.com',
        subscription_tier: 'starter',
      },
    ];

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert(organizations)
      .select();

    if (orgError) throw orgError;
    console.log(`✓ Created ${orgData.length} organizations\n`);

    // 2. Create demo AI tools
    console.log('🤖 Creating demo AI tools...');
    const tools = [
      // HealthTech tools
      {
        organization_id: orgData[0].id,
        tool_name: 'ChatGPT',
        tool_vendor: 'OpenAI',
        tool_type: 'llm',
        version: 'GPT-4',
        deployment_type: 'cloud',
        processes_personal_info: true,
        processes_sensitive_info: true,
        cross_border_disclosure: true,
        data_residency: 'US',
        risk_level: 'high',
        approval_status: 'pending',
        privacy_act_compliant: false,
      },
      {
        organization_id: orgData[0].id,
        tool_name: 'Claude',
        tool_vendor: 'Anthropic',
        tool_type: 'llm',
        deployment_type: 'cloud',
        processes_personal_info: false,
        processes_sensitive_info: false,
        cross_border_disclosure: false,
        risk_level: 'low',
        approval_status: 'approved',
        privacy_act_compliant: true,
      },
      // FinServe tools
      {
        organization_id: orgData[1].id,
        tool_name: 'GitHub Copilot',
        tool_vendor: 'GitHub/Microsoft',
        tool_type: 'code_assist',
        deployment_type: 'cloud',
        processes_personal_info: false,
        processes_sensitive_info: false,
        cross_border_disclosure: true,
        data_residency: 'US',
        risk_level: 'medium',
        approval_status: 'conditional',
        approval_conditions: 'No customer data in code',
        privacy_act_compliant: true,
      },
      {
        organization_id: orgData[1].id,
        tool_name: 'Microsoft 365 Copilot',
        tool_vendor: 'Microsoft',
        tool_type: 'data_analysis',
        deployment_type: 'cloud',
        processes_personal_info: true,
        processes_sensitive_info: true,
        cross_border_disclosure: true,
        data_residency: 'AU',
        risk_level: 'critical',
        approval_status: 'under_review',
        privacy_act_compliant: true,
      },
      // Retail tools
      {
        organization_id: orgData[2].id,
        tool_name: 'Midjourney',
        tool_vendor: 'Midjourney',
        tool_type: 'image_gen',
        deployment_type: 'cloud',
        processes_personal_info: false,
        processes_sensitive_info: false,
        cross_border_disclosure: false,
        risk_level: 'low',
        approval_status: 'approved',
      },
      {
        organization_id: orgData[2].id,
        tool_name: 'Custom AI Assistant',
        tool_vendor: 'Unknown',
        tool_type: 'chatbot',
        deployment_type: 'cloud',
        processes_personal_info: true,
        processes_sensitive_info: false,
        cross_border_disclosure: false,
        risk_level: 'high',
        approval_status: 'banned',
      },
    ];

    const { data: toolData, error: toolError } = await supabase
      .from('ai_tools_registry')
      .insert(tools)
      .select();

    if (toolError) throw toolError;
    console.log(`✓ Created ${toolData.length} AI tools\n`);

    // 3. Create demo policies
    console.log('📋 Creating demo policies...');
    const policies = [
      {
        organization_id: orgData[0].id, // HealthTech
        policy_name: 'HIPAA-Equivalent Data Protection',
        policy_description: 'Blocks AI tools from processing patient health information',
        policy_type: 'privacy_protection',
        enforcement_level: 'block',
        rules: {
          block_sensitive_info: true,
          block_personal_info_external: true,
          forbidden_data_types: ['restricted', 'confidential'],
          require_encryption: true,
        },
        priority: 1,
        is_active: true,
      },
      {
        organization_id: orgData[1].id, // FinServe
        policy_name: 'APRA Compliance',
        policy_description: 'Financial services regulatory compliance',
        policy_type: 'industry_specific',
        enforcement_level: 'block',
        rules: {
          require_approved_tools: true,
          block_cross_border: true,
          forbidden_data_types: ['restricted'],
          max_data_retention_days: 2555,
        },
        priority: 1,
        is_active: true,
      },
      {
        organization_id: orgData[2].id, // Retail
        policy_name: 'Consumer Data Protection',
        policy_description: 'Australian Consumer Law compliance',
        policy_type: 'data_handling',
        enforcement_level: 'alert',
        rules: {
          allowed_data_types: ['public', 'internal'],
          require_consent_for_personal_info: true,
          max_monthly_cost: 1000,
        },
        priority: 50,
        is_active: true,
      },
    ];

    const { data: policyData, error: policyError } = await supabase
      .from('byoai_policies')
      .insert(policies)
      .select();

    if (policyError) throw policyError;
    console.log(`✓ Created ${policyData.length} policies\n`);

    // 4. Create demo usage logs (only if we have a user)
    let usageData = [];
    if (demoUserId) {
      console.log('📊 Creating demo usage logs...');
      const usageLogs = [];

      for (let i = 0; i < 50; i++) {
        const randomOrg = orgData[Math.floor(Math.random() * orgData.length)];
        const orgTools = toolData.filter(t => t.organization_id === randomOrg.id);
        if (orgTools.length === 0) continue;

        const randomTool = orgTools[Math.floor(Math.random() * orgTools.length)];
        const dataClassifications = ['public', 'internal', 'confidential', 'restricted'];
        const randomClassification = dataClassifications[Math.floor(Math.random() * dataClassifications.length)];

        usageLogs.push({
          organization_id: randomOrg.id,
          user_id: demoUserId,
          tool_id: randomTool.id,
          session_id: `session_${i}`,
          data_classification: randomClassification,
          contains_personal_info: Math.random() > 0.7,
          contains_sensitive_info: Math.random() > 0.85,
          prompt_hash: `hash_${i}_${Date.now()}`,
          prompt_token_count: Math.floor(Math.random() * 2000) + 100,
          response_token_count: Math.floor(Math.random() * 3000) + 200,
          estimated_cost_usd: (Math.random() * 0.5).toFixed(4),
          created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      const { data, error: usageError } = await supabase
        .from('ai_usage_logs')
        .insert(usageLogs)
        .select();

      if (usageError) throw usageError;
      usageData = data;
      console.log(`✓ Created ${usageData.length} usage logs\n`);
    } else {
      console.log('⏭️  Skipping usage logs (no user available)\n');
    }

    // 5. Create demo violations (only if we have a user)
    let violationData = [];
    if (demoUserId) {
      console.log('⚠️  Creating demo compliance violations...');
      const violations = [
        {
          organization_id: orgData[0].id,
          user_id: demoUserId,
          tool_id: toolData[0].id, // ChatGPT in HealthTech
          policy_id: policyData[0].id,
          violation_type: 'sensitive_info_blocked',
          severity: 'critical',
          details: {
            rule_violated: 'block_sensitive_info',
            data_classification: 'restricted',
            message: 'Attempted to process patient health records in unapproved tool',
          },
          remediation_status: 'under_investigation',
          potential_privacy_breach: true,
          reportable_to_oaic: true,
          affected_data_subjects: 150,
        },
        {
          organization_id: orgData[1].id,
          user_id: demoUserId,
          tool_id: toolData[3].id, // M365 Copilot
          policy_id: policyData[1].id,
          violation_type: 'unapproved_tool',
          severity: 'high',
          details: {
            rule_violated: 'require_approved_tools',
            message: 'Financial data processed in tool pending approval',
          },
          remediation_status: 'acknowledged',
          potential_privacy_breach: false,
        },
        {
          organization_id: orgData[2].id,
          user_id: demoUserId,
          tool_id: toolData[5].id, // Banned chatbot
          violation_type: 'tool_banned',
          severity: 'warning',
          details: {
            message: 'User attempted to use banned tool',
          },
          remediation_status: 'remediated',
        },
      ];

      const { data, error: violationError } = await supabase
        .from('compliance_violations')
        .insert(violations)
        .select();

      if (violationError) throw violationError;
      violationData = data;
      console.log(`✓ Created ${violationData.length} violations\n`);
    } else {
      console.log('⏭️  Skipping violations (no user available)\n');
    }

    // 6. Create demo risk assessments
    console.log('🎯 Creating demo risk assessments...');
    const riskAssessments = toolData.map(tool => ({
      organization_id: tool.organization_id,
      tool_id: tool.id,
      assessment_type: 'initial',
      overall_risk_score: Math.floor(Math.random() * 100),
      data_privacy_risk: Math.floor(Math.random() * 100),
      security_risk: Math.floor(Math.random() * 100),
      compliance_risk: Math.floor(Math.random() * 100),
      operational_risk: Math.floor(Math.random() * 100),
      risk_factors: {
        factors: ['Data sensitivity', 'Cross-border transfer', 'Vendor compliance'],
      },
      assessment_method: 'automated',
      requires_action: Math.random() > 0.6,
    }));

    const { data: riskData, error: riskError } = await supabase
      .from('risk_assessments')
      .insert(riskAssessments)
      .select();

    if (riskError) throw riskError;
    console.log(`✓ Created ${riskData.length} risk assessments\n`);

    console.log('✅ Demo data seeding completed successfully!\n');
    console.log('Summary:');
    console.log(`- ${orgData.length} Organizations`);
    console.log(`- ${toolData.length} AI Tools`);
    console.log(`- ${policyData.length} Policies`);
    console.log(`- ${usageData.length} Usage Logs`);
    console.log(`- ${violationData.length} Violations`);
    console.log(`- ${riskData.length} Risk Assessments`);

  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    process.exit(1);
  }
}

// Run the seeding
seedDemoData();
