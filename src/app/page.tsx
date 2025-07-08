import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import DocumentAnalysisPanel from './components/DocumentAnalysisPanel'; // Import the new component
import AnalysisHistoryPanel from './components/AnalysisHistoryPanel'; // Import the new component

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  // Ref to trigger document list refresh in DocumentAnalysisPanel
  const documentAnalysisPanelRef = useRef<{ refreshDocuments: () => void }>(null);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user || null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for a confirmation link!');
    }
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Signed in successfully!');
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Signed out successfully!');
      setUser(null);
    }
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatOutput, setChatOutput] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!user) {
      setUploadMessage('Please sign in to upload documents.');
      return;
    }
    if (!selectedFile) {
      setUploadMessage('Please select a file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setUploadMessage(`Upload successful: ${data.message}`);
        // Trigger refresh in DocumentAnalysisPanel
        if (documentAnalysisPanelRef.current) {
          documentAnalysisPanelRef.current.refreshDocuments();
        }
      } else {
        setUploadMessage(`Upload failed: ${data.error}`);
      }
    } catch (error: any) {
      setUploadMessage(`Upload error: ${error.message}`);
    }
  };

  const handleChatSubmit = async () => {
    if (!user) {
      setChatOutput('Please sign in to chat.');
      return;
    }
    if (!chatInput.trim()) {
      setChatOutput('Please enter a message.');
      return;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: chatInput }] }),
      });

      const data = await response.json();
      if (response.ok) {
        setChatOutput(data.response);
      } else {
        setChatOutput(`Chat failed: ${data.error}`);
      }
    } catch (error: any) {
      setChatOutput(`Chat error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-10">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Compli MVP</h1>

      {!user ? (
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md mb-8">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Sign In / Sign Up</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md mb-2"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md mb-4"
          />
          <button
            onClick={handleSignIn}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 mb-2"
          >
            Sign In
          </button>
          <button
            onClick={handleSignUp}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Sign Up
          </button>
          {message && <p className="mt-4 text-sm text-gray-600">{message}</p>}
        </div>
      ) : (
        <div className="w-full max-w-md mb-8 text-center">
          <p className="text-lg text-gray-700 mb-4">Welcome, {user.email}!</p>
          <button
            onClick={handleSignOut}
            className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
          >
            Sign Out
          </button>
          {message && <p className="mt-4 text-sm text-gray-600">{message}</p>}
        </div>
      )}

      {user && (
        <>
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md mb-8">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Document Upload</h2>
            <input
              type="file"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            <button
              onClick={handleFileUpload}
              className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Upload Document
            </button>
            {uploadMessage && <p className="mt-2 text-sm text-gray-600">{uploadMessage}</p>}
          </div>

          {/* Document Analysis Panel */}
          <DocumentAnalysisPanel ref={documentAnalysisPanelRef} />

          {/* Analysis History Panel */}
          <AnalysisHistoryPanel />

          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Chat with LLM</h2>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              placeholder="Type your message here..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            ></textarea>
            <button
              onClick={handleChatSubmit}
              className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            >
              Send Message
            </button>
            {chatOutput && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm text-gray-800">{chatOutput}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}