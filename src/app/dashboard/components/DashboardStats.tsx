'use client';

type StatsProps = {
  totalOrgs: number;
  totalTools: number;
  totalPolicies: number;
  averageRisk: number;
};

export function DashboardStats({ totalOrgs, totalTools, totalPolicies, averageRisk }: StatsProps) {
  const stats = [
    { label: 'Organizations', value: totalOrgs, color: 'blue' },
    { label: 'AI Tools', value: totalTools, color: 'purple' },
    { label: 'Policies', value: totalPolicies, color: 'green' },
    { label: 'Avg Risk Score', value: Math.round(averageRisk), color: 'orange' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <p className="text-sm font-medium text-gray-600">{stat.label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
