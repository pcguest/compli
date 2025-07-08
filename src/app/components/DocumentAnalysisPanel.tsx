import React, { useState, useEffect } from 'react';

type Document = {
  id: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
  deleted: boolean;
};

type AnalysisResult = {
  analysis_result: string;
  confidence_score: number;
  tips?: string[];
  human_verification_prompt?: string;
};

const DocumentAnalysisPanel: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState<boolean>(true);
  const [errorDocuments, setErrorDocuments] = useState<string | null>(null);

  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('openai'); // Default to OpenAI

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch('/api/documents/list');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Document[] = await response.json();
        setDocuments(data.filter(doc => !doc.deleted)); // Only show non-deleted documents
      } catch (error: any) {
        setErrorDocuments(error.message);
      } finally {
        setLoadingDocuments(false);
      }
    };

    fetchDocuments();
  }, []);

  const handleAnalyze = async (documentId: string) => {
    setSelectedDocumentId(documentId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const response = await fetch('/api/analyse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: documentId,
          model: selectedModel,
          // apiKey: '' // User can input their own API key here if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: AnalysisResult = await response.json();
      setAnalysisResult(data);
    } catch (error: any) {
      setAnalysisError(error.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Document Analysis</h1>

      <div className="mb-6">
        <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">
          Select AI Model:
        </label>
        <select
          id="model-select"
          name="model-select"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          <option value="openai">OpenAI (GPT-4)</option>
          <option value="claude">Claude</option>
          <option value="mistral">Mistral</option>
        </select>
      </div>

      <h2 className="text-xl font-semibold mb-4 text-gray-700">Your Uploaded Documents</h2>
      {loadingDocuments && <p className="text-gray-600">Loading documents...</p>}
      {errorDocuments && <p className="text-red-500">Error loading documents: {errorDocuments}</p>}

      {!loadingDocuments && documents.length === 0 && (
        <p className="text-gray-600">No documents uploaded yet. Please upload some to analyze.</p>
      )}

      <ul className="space-y-3">
        {documents.map((doc) => (
          <li key={doc.id} className="bg-white shadow overflow-hidden rounded-md px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-gray-900">{doc.file_name}</p>
              <p className="text-sm text-gray-500">Size: {(doc.file_size / 1024).toFixed(2)} KB</p>
              <p className="text-sm text-gray-500">Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => handleAnalyze(doc.id)}
              disabled={analysisLoading && selectedDocumentId === doc.id} // Disable button for current analysis
              className={`ml-4 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${analysisLoading && selectedDocumentId === doc.id ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'}`}
            >
              {analysisLoading && selectedDocumentId === doc.id ? 'Analyzing...' : 'Analyze'}
            </button>
          </li>
        ))}
      </ul>

      {analysisLoading && selectedDocumentId && (
        <div className="mt-8 p-4 bg-blue-100 border border-blue-200 text-blue-700 rounded-md">
          <p>Analyzing document ID: {selectedDocumentId} with {selectedModel}...</p>
        </div>
      )}

      {analysisError && (
        <div className="mt-8 p-4 bg-red-100 border border-red-200 text-red-700 rounded-md">
          <h3 className="text-lg font-medium mb-2">Analysis Error!</h3>
          <p>{analysisError}</p>
        </div>
      )}

      {analysisResult && !analysisLoading && (
        <div className="mt-8 p-6 bg-green-100 border border-green-200 text-green-800 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Analysis Complete!</h3>
          <p className="mb-2"><strong className="text-green-900">Result:</strong> {analysisResult.analysis_result}</p>
          <p className="mb-4"><strong className="text-green-900">Confidence Score:</strong> {(analysisResult.confidence_score * 100).toFixed(0)}%</p>

          {analysisResult.tips && analysisResult.tips.length > 0 && (
            <div className="mt-4">
              <h4 className="text-lg font-medium text-green-900 mb-2">Helpful Tips:</h4>
              <ul className="list-disc list-inside space-y-1">
                {analysisResult.tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {analysisResult.human_verification_prompt && (
            <div className="mt-4 p-3 bg-green-200 rounded-md">
              <p className="text-green-900"><strong>Human Verification Prompt:</strong> {analysisResult.human_verification_prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentAnalysisPanel;
