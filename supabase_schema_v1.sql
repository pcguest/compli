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
-- Create a new bucket for documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING; -- Prevents error if bucket already exists

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
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security for the analysis_logs table
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

-- Policy for users to insert analysis logs (for their own actions)
CREATE POLICY "Users can insert their own analysis logs." ON analysis_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for admins to view all analysis logs (assuming an 'admin' role or similar check)
-- For simplicity, this policy allows all authenticated users to view logs. In a real app,
-- you'd restrict this to specific roles or users.
CREATE POLICY "Admins can view all analysis logs." ON analysis_logs
  FOR SELECT USING (TRUE); -- Consider replacing TRUE with a role-based check like is_admin(auth.uid())