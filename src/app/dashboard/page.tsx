'use client';

import { useDashboardData } from './hooks/useDashboardData';
import { DashboardStats } from './components/DashboardStats';

export default function DashboardPage() {
  const { data, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalOrgs = data.organizations.length;
  const totalTools = data.tools.length;
  const totalPolicies = data.policies.length;
  const averageRisk = data.riskAssessments.length > 0
    ? data.riskAssessments.reduce((sum, a) => sum + (a.overall_risk || 0), 0) / data.riskAssessments.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            BYOAI Compliance Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Monitor AI tool usage and compliance across your organization
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <DashboardStats
          totalOrgs={totalOrgs}
          totalTools={totalTools}
          totalPolicies={totalPolicies}
          averageRisk={averageRisk}
        />

        {/* AI Tools Section */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Tools Registry</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tool Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Level
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.tools.map((tool) => (
                  <tr key={tool.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {tool.tool_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tool.tool_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        tool.risk_level === 'critical' ? 'bg-red-100 text-red-800' :
                        tool.risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
                        tool.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {tool.risk_level || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tool.approval_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Organizations Section */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Organizations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.organizations.map((org) => (
              <div key={org.id} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{org.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{org.industry_sector}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ABN:</span>
                  <span className="font-medium text-gray-900">{org.abn || 'N/A'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Policies Section */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Compliance Policies</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {data.policies.map((policy) => (
                <div key={policy.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{policy.policy_name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{policy.policy_type}</p>
                    </div>
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                      policy.enforcement_level === 'block' ? 'bg-red-100 text-red-800' :
                      policy.enforcement_level === 'alert' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {policy.enforcement_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
