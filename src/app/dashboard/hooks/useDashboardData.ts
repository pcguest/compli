'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Organization {
  id: string;
  name: string;
  abn?: string;
  industry_sector?: string;
  created_at: string;
  [key: string]: any;
}

interface AITool {
  id: string;
  tool_name: string;
  tool_vendor?: string;
  approval_status?: string;
  created_at: string;
  [key: string]: any;
}

interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  enforcement_level: string;
  created_at: string;
  [key: string]: any;
}

interface RiskAssessment {
  id: string;
  tool_id: string;
  overall_risk: number;
  risk_level: string;
  assessed_at: string;
  [key: string]: any;
}

interface DashboardData {
  organizations: Organization[];
  tools: AITool[];
  policies: Policy[];
  riskAssessments: RiskAssessment[];
}

export function useDashboardData() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    organizations: [],
    tools: [],
    policies: [],
    riskAssessments: []
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch organizations
        const { data: orgs } = await supabase
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false });

        // Fetch AI tools
        const { data: tools } = await supabase
          .from('ai_tools_registry')
          .select('*')
          .order('created_at', { ascending: false });

        // Fetch policies
        const { data: policies } = await supabase
          .from('byoai_policies')
          .select('*')
          .order('created_at', { ascending: false });

        // Fetch risk assessments
        const { data: assessments } = await supabase
          .from('risk_assessments')
          .select('*')
          .order('assessed_at', { ascending: false });

        setData({
          organizations: orgs || [],
          tools: tools || [],
          policies: policies || [],
          riskAssessments: assessments || []
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading };
}
