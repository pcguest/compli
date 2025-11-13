-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Document embeddings table
-- Stores vector embeddings for semantic search of document content
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Chunk information (for large documents split into chunks)
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  chunk_metadata JSONB, -- Store page number, section, etc.

  -- Vector embedding (OpenAI text-embedding-3-small produces 1536 dimensions)
  embedding vector(1536) NOT NULL,

  -- Metadata for search optimization
  token_count INTEGER,
  language TEXT DEFAULT 'en',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(document_id, chunk_index)
);

-- Create index for vector similarity search (HNSW is faster for large datasets)
CREATE INDEX idx_document_embeddings_vector
ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Traditional indexes
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX idx_document_embeddings_created_at ON document_embeddings(created_at DESC);

-- Enable RLS
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

-- Users can view embeddings for their own documents
CREATE POLICY "Users can view embeddings for their documents"
ON document_embeddings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_embeddings.document_id
    AND documents.user_id = auth.uid()
  )
);

-- Users can insert embeddings for their own documents
CREATE POLICY "Users can create embeddings for their documents"
ON document_embeddings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_embeddings.document_id
    AND documents.user_id = auth.uid()
  )
);

-- Users can delete embeddings for their own documents
CREATE POLICY "Users can delete embeddings for their documents"
ON document_embeddings FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents
    WHERE documents.id = document_embeddings.document_id
    AND documents.user_id = auth.uid()
  )
);

-- ============================================================================
-- SEMANTIC SEARCH FUNCTIONS
-- ============================================================================

-- Function to perform semantic search across user's documents
CREATE OR REPLACE FUNCTION search_documents_semantic(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  chunk_text TEXT,
  chunk_metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.file_name AS document_name,
    de.chunk_text,
    de.chunk_metadata,
    1 - (de.embedding <=> p_query_embedding) AS similarity
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  WHERE
    d.user_id = p_user_id
    AND d.deleted_at IS NULL
    AND 1 - (de.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Function to find similar documents based on a given document
CREATE OR REPLACE FUNCTION find_similar_documents(
  p_user_id UUID,
  p_document_id UUID,
  p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  average_similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH source_embeddings AS (
    SELECT embedding
    FROM document_embeddings
    WHERE document_id = p_document_id
  ),
  similarities AS (
    SELECT
      d.id AS doc_id,
      d.file_name,
      AVG(1 - (de.embedding <=> se.embedding)) AS avg_sim
    FROM document_embeddings de
    JOIN documents d ON d.id = de.document_id
    CROSS JOIN source_embeddings se
    WHERE
      d.user_id = p_user_id
      AND d.id != p_document_id
      AND d.deleted_at IS NULL
    GROUP BY d.id, d.file_name
  )
  SELECT doc_id, file_name, avg_sim
  FROM similarities
  ORDER BY avg_sim DESC
  LIMIT p_match_count;
END;
$$;

-- ============================================================================
-- KNOWLEDGE BASE FOR RAG (Retrieval-Augmented Generation)
-- ============================================================================

-- Australian legal knowledge base
CREATE TABLE IF NOT EXISTS legal_knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content information
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,

  -- Classification
  category TEXT NOT NULL, -- legislation, regulation, case_law, guidance, etc.
  jurisdiction TEXT DEFAULT 'AU', -- AU, NSW, VIC, QLD, etc.
  source TEXT, -- URL or reference to original document

  -- Legal specifics
  legislation_ref TEXT, -- e.g., "Corporations Act 2001"
  last_updated DATE,
  is_current BOOLEAN DEFAULT true,

  -- Vector embedding
  embedding vector(1536),

  -- Metadata
  tags TEXT[],
  industry_tags TEXT[], -- retail, finance, healthcare, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for vector search on legal knowledge
CREATE INDEX idx_legal_kb_vector
ON legal_knowledge_base
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_legal_kb_category ON legal_knowledge_base(category) WHERE is_current = true;
CREATE INDEX idx_legal_kb_jurisdiction ON legal_knowledge_base(jurisdiction) WHERE is_current = true;
CREATE INDEX idx_legal_kb_tags ON legal_knowledge_base USING gin(tags);

-- Public read access to knowledge base (no RLS needed as it's reference data)
-- All authenticated users can access this
ALTER TABLE legal_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view legal knowledge base"
ON legal_knowledge_base FOR SELECT
TO authenticated
USING (is_current = true);

-- Function to search legal knowledge base
CREATE OR REPLACE FUNCTION search_legal_knowledge(
  p_query_embedding vector(1536),
  p_jurisdiction TEXT DEFAULT 'AU',
  p_category TEXT DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.75,
  p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  summary TEXT,
  category TEXT,
  legislation_ref TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lkb.id,
    lkb.title,
    lkb.content,
    lkb.summary,
    lkb.category,
    lkb.legislation_ref,
    1 - (lkb.embedding <=> p_query_embedding) AS similarity
  FROM legal_knowledge_base lkb
  WHERE
    lkb.is_current = true
    AND (lkb.jurisdiction = p_jurisdiction OR lkb.jurisdiction = 'AU')
    AND (p_category IS NULL OR lkb.category = p_category)
    AND 1 - (lkb.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY lkb.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================================================
-- CHAT HISTORY WITH EMBEDDINGS
-- ============================================================================

-- Store chat conversations with embeddings for context retrieval
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT,
  related_document_ids UUID[], -- Array of document IDs discussed

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Vector embedding for semantic search of chat history
  embedding vector(1536),

  -- Metadata
  token_count INTEGER,
  model_used TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_vector
ON chat_messages
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;

-- Enable RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat
CREATE POLICY "Users can manage their own chat sessions"
ON chat_sessions FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view messages from their sessions"
ON chat_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert messages in their sessions"
ON chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  )
);

-- Function to search chat history
CREATE OR REPLACE FUNCTION search_chat_history(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  session_id UUID,
  session_title TEXT,
  message_content TEXT,
  message_role TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id AS session_id,
    cs.title AS session_title,
    cm.content AS message_content,
    cm.role AS message_role,
    1 - (cm.embedding <=> p_query_embedding) AS similarity,
    cm.created_at
  FROM chat_messages cm
  JOIN chat_sessions cs ON cs.id = cm.session_id
  WHERE
    cs.user_id = p_user_id
    AND cm.embedding IS NOT NULL
    AND 1 - (cm.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY cm.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

COMMENT ON TABLE document_embeddings IS 'Vector embeddings of document chunks for semantic search';
COMMENT ON TABLE legal_knowledge_base IS 'Curated Australian legal knowledge for RAG enhancement';
COMMENT ON TABLE chat_sessions IS 'User chat sessions for conversation history';
COMMENT ON TABLE chat_messages IS 'Individual messages with embeddings for context retrieval';
COMMENT ON FUNCTION search_documents_semantic IS 'Semantic search across user documents using vector similarity';
COMMENT ON FUNCTION search_legal_knowledge IS 'Search Australian legal knowledge base with semantic similarity';
