'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AITool {
  id: string;
  tool_name: string;
  tool_vendor?: string;
  tool_type: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  approval_status: string;
  processes_personal_info: boolean;
  processes_sensitive_info: boolean;
  cross_border_disclosure: boolean;
  privacy_act_compliant?: boolean;
  created_at: string;
}

export default function ToolsRegistry() {
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'blocked'>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  // Fetch tools
  const { data, isLoading } = useQuery({
    queryKey: ['ai-tools', filter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (riskFilter !== 'all') params.append('risk_level', riskFilter);

      const res = await fetch(`/api/byoai/tools?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tools');
      return res.json();
    },
  });

  // Approve/reject tool
  const approveMutation = useMutation({
    mutationFn: async ({ tool_id, status }: { tool_id: string; status: string }) => {
      const res = await fetch('/api/byoai/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id, approval_status: status }),
      });
      if (!res.ok) throw new Error('Failed to update tool');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tools'] });
    },
  });

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      case 'conditional': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">AI Tools Registry</h1>
        <p className="text-gray-600">Manage and approve AI tools used in your organization</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Approval Status</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">All Tools</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Risk Level</label>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">All Risks</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Tools Table */}
      {isLoading ? (
        <div className="text-center py-12">Loading tools...</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tool Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Vendor</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Risk Level</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Compliance</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.tools?.map((tool: AITool) => (
                <tr key={tool.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{tool.tool_name}</div>
                    <div className="text-sm text-gray-500">
                      Added {new Date(tool.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{tool.tool_vendor || 'Unknown'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm capitalize">{tool.tool_type.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRiskColor(tool.risk_level)}`}>
                      {tool.risk_level.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(tool.approval_status)}`}>
                      {tool.approval_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {tool.cross_border_disclosure && (
                        <div className="flex items-center gap-1 text-xs text-orange-600">
                          <span>⚠️</span>
                          <span>Cross-border</span>
                        </div>
                      )}
                      {tool.processes_personal_info && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <span>👤</span>
                          <span>Personal info</span>
                        </div>
                      )}
                      {tool.processes_sensitive_info && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                          <span>🔒</span>
                          <span>Sensitive info</span>
                        </div>
                      )}
                      {tool.privacy_act_compliant && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <span>✓</span>
                          <span>Privacy Act</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {tool.approval_status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate({ tool_id: tool.id, status: 'approved' })}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => approveMutation.mutate({ tool_id: tool.id, status: 'blocked' })}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          >
                            Block
                          </button>
                        </>
                      )}
                      {tool.approval_status === 'approved' && (
                        <button
                          onClick={() => approveMutation.mutate({ tool_id: tool.id, status: 'under_review' })}
                          className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data?.tools?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No tools found. Register your first AI tool to get started.
            </div>
          )}
        </div>
      )}

      {/* Stats Summary */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold">{data?.tools?.length || 0}</div>
          <div className="text-sm text-gray-600">Total Tools</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">
            {data?.tools?.filter((t: AITool) => t.approval_status === 'approved').length || 0}
          </div>
          <div className="text-sm text-gray-600">Approved</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-yellow-600">
            {data?.tools?.filter((t: AITool) => t.approval_status === 'pending').length || 0}
          </div>
          <div className="text-sm text-gray-600">Pending Review</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-red-600">
            {data?.tools?.filter((t: AITool) => t.risk_level === 'critical' || t.risk_level === 'high').length || 0}
          </div>
          <div className="text-sm text-gray-600">High Risk</div>
        </div>
      </div>
    </div>
  );
}
