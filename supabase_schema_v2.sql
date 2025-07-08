-- v2: Combined schema for document handling and AI analysis logging

-- Create the documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Enable Row Level Security for the documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own documents
CREATE POLICY "Users can view their own documents." ON documents
  FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert their own documents
CREATE POLICY "Users can insert their own documents." ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own documents
CREATE POLICY "Users can update their own documents." ON documents
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete their own documents
CREATE POLICY "Users can delete their own documents." ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- Supabase Storage RLS for a 'documents' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Policy for users to upload to their own folder within the 'documents' bucket
CREATE POLICY "Allow authenticated users to upload to their own folder" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for users to view their own files within the 'documents' bucket
CREATE POLICY "Allow authenticated users to view their own folder" ON storage.objects
FOR SELECT USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for users to delete their own files within the 'documents' bucket
CREATE POLICY "Allow authenticated users to delete their own folder" ON storage.objects
FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create the analysis_logs table
CREATE TABLE analysis_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_id UUID REFERENCES documents(id) NOT NULL,
  model_used TEXT NOT NULL,
  api_type TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view their own logs
CREATE POLICY "Users can view their own logs" ON analysis_logs
FOR SELECT USING (auth.uid() = user_id);

-- Policy to allow users to insert their own logs
CREATE POLICY "Users can insert their own logs" ON analysis_logs
FOR INSERT WITH CHECK (auth.uid() = user_id);