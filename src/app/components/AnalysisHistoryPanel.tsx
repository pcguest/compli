import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for client-side fetching
// Ensure these are loaded from environment variables in a real app
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type AnalysisLog = {
  id: string;
  user_id: string;
  file_id: string;
  model_used: string;
  timestamp: string;
  documents: { file_name: string } | null; // Join with documents table
};

const AnalysisHistoryPanel: React.FC = () => {
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysisLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError('User not authenticated.');
          setLoading(false);
          return;
        }

        // Fetch analysis logs and join with documents table to get file_name
        const { data, error: fetchError } = await supabase
          .from('analysis_logs')
          .select(`
            id,
            file_id,
            model_used,
            timestamp,
            documents (file_name) // Select file_name from the joined documents table
          `)
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false });

        if (fetchError) {
          console.error('Error fetching analysis logs:', fetchError);
          throw new Error(fetchError.message);
        }

        setAnalysisLogs(data as AnalysisLog[]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysisLogs();

    // Set up real-time subscription for new logs (optional, but good for dynamic updates)
    const channel = supabase
      .channel('analysis_logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'analysis_logs', filter: `user_id=eq.${supabase.auth.getUser().then(u => u.data.user?.id)}` },
        (payload) => {
          // Refetch or intelligently update the list
          fetchAnalysisLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-4 bg-gray-100 rounded-lg shadow-md w-full max-w-md mb-8">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">Analysis History</h2>

      {loading && <p className="text-gray-600">Loading analysis history...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!loading && analysisLogs.length === 0 && (
        <p className="text-gray-600">No analysis history found for this user.</p>
      )}

      <ul className="space-y-4">
        {analysisLogs.map((log) => (
          <li key={log.id} className="bg-white p-4 rounded-md shadow-sm">
            <p className="text-lg font-medium text-gray-900">File: {log.documents?.file_name || 'N/A'}</p>
            <p className="text-sm text-gray-600">Model Used: {log.model_used}</p>
            <p className="text-sm text-gray-600">Date: {new Date(log.timestamp).toLocaleString()}</p>
            {/* Summary preview can be added here if analysis_logs table stores it */}
            {/* Example: <p className="text-sm text-gray-700 mt-2">Summary: {log.summary_preview}</p> */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AnalysisHistoryPanel;
