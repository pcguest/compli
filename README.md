# Compli MVP

This is the Minimum Viable Product (MVP) for Compli, a secure, British-English, Australia-first legal compliance assistant for small businesses.

## Tech Stack

- **Frontend & Backend:** Next.js (React with TypeScript)
- **Database, Authentication, & Storage:** Supabase
- **LLM Integration:** OpenAI GPT-4 (default), with fallback options for Claude/Gemini.

## Getting Started

Follow these steps to set up and run the Compli MVP locally.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd compli-mvp
```

### 2. Install Dependencies

This project uses `npm` as its package manager.

```bash
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root of the project based on the `.env.example` file. This file will contain your secret keys.

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
```

- **`NEXT_PUBLIC_SUPABASE_URL`**: Your Supabase project URL. Find this in your Supabase project settings under `API`. It typically looks like `https://<project-ref>.supabase.co`.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**: Your Supabase public anon key. Find this in your Supabase project settings under `API`. This key is safe to expose in your frontend.
- **`OPENAI_API_KEY`**: Your OpenAI API key for GPT-4. This is the default LLM.
- **`ANTHROPIC_API_KEY`**: (Optional) Your Anthropic API key for Claude. If provided, the system will attempt to use Claude if OpenAI is not configured.
- **`GOOGLE_API_KEY`**: (Optional) Your Google API key for Gemini. If provided, the system will attempt to use Gemini if OpenAI and Anthropic are not configured.

**Important:** Never commit your `.env.local` file to version control.

### 4. Supabase Setup

1.  **Create a Supabase Project:** Go to [Supabase](https://supabase.com/) and create a new project.
2.  **Create a Storage Bucket:** In your Supabase project, navigate to `Storage` and create a new bucket named `compli-documents`. Ensure its policies are configured for secure access (e.g., only authenticated users can upload/delete).
3.  **Create `documents` Table:** In your Supabase project, navigate to `Table Editor` and create a new table named `documents` with the following schema:

    ```sql
    CREATE TABLE documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      size BIGINT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      deleted_at TIMESTAMP WITH TIME ZONE -- For soft delete (trash mode)
    );
    ```

    Ensure you set up appropriate Row Level Security (RLS) policies for this table to restrict access to only the document owner.

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## Project Structure

- `src/app/`: Next.js App Router for pages and API routes.
  - `api/`: API routes for backend functionality.
    - `documents/upload/route.ts`: Handles document uploads to Supabase Storage.
    - `documents/delete/route.ts`: Handles document deletion from Supabase Storage.
    - `documents/download/route.ts`: Handles document downloads from Supabase Storage.
    - `documents/list/route.ts`: Handles listing user's documents.
    - `chat/route.ts`: Handles LLM interactions.
  - `page.tsx`: The main frontend page.
- `src/lib/`: Utility functions and configurations.
  - `supabase.ts`: Supabase client initialization (client-side).
  - `supabaseServer.ts`: Supabase client initialization (server-side).
  - `llm.ts`: LLM client for OpenAI, with placeholders for Anthropic and Google Gemini.
- `.env.example`: Example environment variables.
- `README.md`: This file.

## Next Steps

- Implement robust authentication and authorization for document upload/deletion and LLM access.
- Enhance the UI/UX for document management and chat.
- Integrate more sophisticated LLM interactions and prompt engineering.
- Add database schema for document metadata.
