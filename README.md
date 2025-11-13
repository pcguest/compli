# Compli - Legal Compliance Assistant

A secure, Australia-first legal compliance assistant for small businesses, providing AI-powered document analysis and regulatory guidance.

## Tech Stack

### Core Infrastructure
- **Frontend & Backend:** Next.js 15 (App Router) with TypeScript
- **Database:** Supabase (PostgreSQL 15+)
- **Authentication:** Supabase Auth with Row Level Security (RLS)
- **Storage:** Supabase Storage with signed URLs and access policies
- **Caching:** Redis (Upstash) for rate limiting and session management

### AI & Document Processing
- **Primary LLM:** Anthropic Claude 3.5 Sonnet (superior for legal analysis, Australian context)
- **Fallback LLM:** OpenAI GPT-4o
- **Document Processing:**
  - PDF extraction: pdf-parse with fallback to OCR
  - DOCX support: mammoth
  - Vector embeddings: OpenAI text-embedding-3-small
- **Vector Database:** Supabase pgvector for semantic search and RAG

### Observability & Security
- **Error Tracking:** Sentry
- **Rate Limiting:** Upstash Redis
- **Email Notifications:** Resend API
- **Analytics:** Posthog (privacy-focused)
- **Security:** Helmet.js, OWASP best practices

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

Create a `.env.local` file in the root of the project. This file will contain your secret keys.

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI/LLM Configuration (Primary: Claude)
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key  # Fallback and embeddings

# Rate Limiting & Caching
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Email Notifications
RESEND_API_KEY=your_resend_api_key
NOTIFICATION_EMAIL_FROM=noreply@yourdomain.com

# Monitoring (Optional but recommended)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_AUTH_TOKEN=your_sentry_auth_token
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

**Key Configuration Details:**
- **Supabase Service Role Key**: Required for admin operations (bypass RLS). Keep this secret.
- **Claude (Primary)**: Better for legal analysis, nuanced Australian legal context, and long document processing
- **OpenAI (Fallback)**: Used for embeddings and as backup LLM
- **Upstash Redis**: Distributed rate limiting and caching (free tier available)
- **Resend**: Transactional email service (generous free tier)

**Security Note:** Never commit `.env.local` to version control. Add to `.gitignore`.

### 4. Database Setup

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase locally
supabase init

# Link to your remote project
supabase link --project-ref <your-project-ref>

# Run migrations
supabase db push
```

#### Option B: Manual Setup

1. **Create a Supabase Project:** Go to [Supabase](https://supabase.com/) and create a new project.

2. **Enable Extensions:** In SQL Editor, run:
```sql
-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

3. **Run Database Migrations:** Copy and execute the SQL from `supabase/migrations/` in order:
   - `001_initial_schema.sql` - Core tables
   - `002_rls_policies.sql` - Security policies
   - `003_vector_search.sql` - Semantic search setup
   - `004_audit_logs.sql` - Compliance audit trail

4. **Configure Storage Bucket:**
```sql
-- Create documents bucket with security policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Storage policies: Users can only access their own documents
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## Project Structure

```
compli/
├── docs/                                 # Additional documentation
│   ├── API_REFERENCE.md
│   ├── BYOAI_IMPLEMENTATION.md
│   ├── DEPLOYMENT_CHECKLIST.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   └── VERIFICATION_COMPLETE.md
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyse/route.ts          # Document AI analysis endpoint
│   │   │   ├── chat/route.ts             # LLM chat interface
│   │   │   ├── organizations/route.ts    # Organization management
│   │   │   ├── byoai/                    # BYOAI compliance platform
│   │   │   │   ├── monitor/route.ts      # AI tool monitoring
│   │   │   │   ├── policies/route.ts     # Policy management
│   │   │   │   └── tools/route.ts        # AI tools registry
│   │   │   ├── compliance/               # Compliance tracking
│   │   │   │   ├── frameworks/route.ts   # Compliance frameworks
│   │   │   │   └── violations/route.ts   # Violation tracking
│   │   │   └── documents/
│   │   │       ├── upload/route.ts       # Secure document upload
│   │   │       ├── delete/route.ts       # Soft delete documents
│   │   │       ├── download/route.ts     # Signed URL downloads
│   │   │       └── list/route.ts         # List user documents
│   │   ├── components/
│   │   │   ├── DocumentAnalysisPanel.tsx
│   │   │   ├── AnalysisHistoryPanel.tsx
│   │   │   └── byoai/
│   │   │       └── ToolsRegistry.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx                  # Compliance dashboard
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── supabase.ts                   # Client-side Supabase
│   │   ├── supabaseServer.ts             # Server-side Supabase
│   │   ├── llm.ts                        # LLM abstraction layer
│   │   ├── byoai/
│   │   │   ├── policyEngine.ts           # Policy evaluation engine
│   │   │   └── riskCalculator.ts         # Risk assessment
│   │   └── compliance/
│   │       └── australianLaws.ts         # Australian compliance rules
│   ├── scripts/
│   │   └── seedDemo.ts                   # Demo data seeding
│   └── types/
│       └── index.ts                      # TypeScript definitions
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        # Core database schema
│   │   ├── 002_rls_policies.sql          # Row-level security
│   │   ├── 003_vector_search.sql         # pgvector setup
│   │   ├── 004_audit_logs.sql            # Compliance audit trail
│   │   └── 005_byoai_compliance.sql      # BYOAI-specific schema
│   ├── functions/
│   │   └── send-analysis-email/          # Edge function for emails
│   └── config.toml
├── .env.local                            # Local environment variables
└── package.json
```

## Architecture Decisions

### Why Claude over GPT-4 for Legal Analysis?

1. **Superior Legal Reasoning**: Claude 3.5 Sonnet excels at nuanced legal interpretation
2. **Australian Context**: Better understanding of Commonwealth legal framework
3. **Document Length**: 200K token context window vs GPT-4's 128K
4. **Safety & Accuracy**: Lower hallucination rate on legal matters
5. **Cost Efficiency**: Better performance-to-cost ratio for long documents

### Why Upstash Redis?

- Serverless-native (perfect for Next.js edge)
- Global low-latency
- Built-in rate limiting support
- Free tier sufficient for MVP

### Why pgvector over Pinecone?

- No additional service to manage
- Lower latency (same database)
- Better for compliance (data residency)
- Cost-effective at scale
- ACID guarantees

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```

### Environment-Specific Considerations

- **Production**: Enable Sentry, PostHog analytics
- **Staging**: Use separate Supabase project
- **Local**: Use Supabase local development

## Security Best Practices

1. **Authentication**: All endpoints require Supabase auth
2. **Authorization**: RLS policies enforce user-level access
3. **Rate Limiting**: Distributed Redis-based limiting
4. **Input Validation**: Zod schemas on all API routes
5. **File Upload**: MIME type validation, size limits, virus scanning (ClamAV)
6. **Audit Logging**: All document operations logged with user context
7. **Data Encryption**: At-rest and in-transit encryption
8. **Secret Management**: Never commit secrets, use environment variables

## Monitoring & Observability

- **Error Tracking**: Sentry captures and groups errors
- **Performance**: Next.js analytics + custom metrics
- **User Analytics**: PostHog for product insights
- **Database**: Supabase built-in monitoring
- **Rate Limits**: Redis metrics dashboard

## Cost Estimation (Monthly, MVP Scale)

- Supabase: $0-25 (Pro tier recommended for production)
- Anthropic API: ~$50-200 (depends on usage)
- Upstash Redis: $0 (free tier covers MVP)
- Resend: $0 (free tier: 3k emails/month)
- Vercel: $0 (Hobby) or $20 (Pro)
- Sentry: $0 (free tier covers MVP)

**Total: $50-250/month for early stage**

## Documentation

Additional documentation can be found in the [/docs](/docs) folder:

- [API_REFERENCE.md](/docs/API_REFERENCE.md) - Complete API endpoint documentation
- [BYOAI_IMPLEMENTATION.md](/docs/BYOAI_IMPLEMENTATION.md) - BYOAI platform architecture
- [DEPLOYMENT_CHECKLIST.md](/docs/DEPLOYMENT_CHECKLIST.md) - Production deployment guide
- [IMPLEMENTATION_SUMMARY.md](/docs/IMPLEMENTATION_SUMMARY.md) - Technical implementation details
- [VERIFICATION_COMPLETE.md](/docs/VERIFICATION_COMPLETE.md) - Feature verification checklist

## BYOAI Compliance Platform - Quick Start

### Dashboard Access
- **Local Development**: http://localhost:3000/dashboard
- **Main App**: http://localhost:3000

### Current Implementation Status

**Completed Features:**
- 6 API Routes (Organizations, Tools, Monitoring, Policies, Violations, Frameworks)
- 3 Utility Libraries (Risk Calculator, Policy Engine, Australian Laws)
- Dashboard with 4 sections (Stats, Tools Registry, Organizations, Policies)
- Demo data seeding (3 orgs, 6 tools, 3 policies)
- Complete database schema (12 tables with RLS)

### Running the Project

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables (.env.local)
# Copy .env.example and fill in your Supabase credentials

# 3. Run database migrations
npm run db:migrate

# 4. Seed demo data (optional)
npm run seed:demo

# 5. Start development server
npm run dev
```

### Testing the Dashboard

Once the dev server is running:

1. Navigate to http://localhost:3000/dashboard
2. You should see:
   - **Stats Cards**: Organization, Tools, Policies counts + Avg Risk Score
   - **AI Tools Registry**: Table of registered AI tools with risk levels
   - **Organizations**: Grid of organizations with ABN and industry
   - **Compliance Policies**: List of active policies with enforcement levels

### Key Features Demonstrated

#### 1. Risk Assessment Engine
- Calculates risk scores (0-100) based on 5 factors:
  - Data Sensitivity (35% weight)
  - Deployment Type (20% weight)
  - Cross-Border Transfer (25% weight)
  - Compliance Status (15% weight)
  - Approval Status (5% weight)

#### 2. Policy Enforcement
- Three enforcement levels: Monitor, Alert, Block
- Automatic remediation triggers
- Role-based policy application
- Policy effectiveness tracking

#### 3. Australian Compliance
- Privacy Act 1988 validation (APPs 1, 3, 6, 8, 11, 12, 13)
- ABN validation algorithm
- Notifiable Data Breaches (NDB) assessment
- OAIC report generation
- Industry-specific legislation mapping

### Dashboard Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main Dashboard | [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | Main dashboard page |
| Stats Cards | [src/app/dashboard/components/DashboardStats.tsx](src/app/dashboard/components/DashboardStats.tsx) | KPI display |
| Data Hook | [src/app/dashboard/hooks/useDashboardData.ts](src/app/dashboard/hooks/useDashboardData.ts) | Supabase data fetching |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/organizations | GET/POST | Manage organizations |
| /api/byoai/tools | GET/POST | AI tools registry |
| /api/byoai/policies | GET/POST | Policy management |
| /api/byoai/monitor | GET | Usage monitoring |
| /api/compliance/frameworks | GET | Compliance frameworks |
| /api/compliance/violations | GET/POST | Violation tracking |

### Database Schema

**Core Tables:**
- `organizations` - Multi-tenant organization management
- `organization_members` - User roles and permissions
- `ai_tools_registry` - Registered AI tools
- `tool_usage_logs` - Usage tracking and monitoring
- `byoai_policies` - Compliance policies
- `policy_violations` - Violation records
- `risk_assessments` - Tool risk scores
- `compliance_violations` - Regulatory violations
- `audit_logs` - Complete audit trail

## Next Steps

### Phase 1: Core Infrastructure (Week 1-2)
- [x] Set up proper database migrations
- [x] Build BYOAI compliance dashboard
- [ ] Implement distributed rate limiting with Redis
- [ ] Add comprehensive error handling and logging
- [ ] Set up Sentry for error tracking

### Phase 2: Enhanced Document Processing (Week 3-4)
- [ ] Add DOCX support with mammoth
- [x] Implement vector embeddings for semantic search
- [ ] Add document versioning and change tracking
- [ ] Build RAG pipeline for context-aware responses

### Phase 3: Legal-Specific Features (Week 5-6)
- [x] Australian regulatory database integration
- [x] Industry-specific compliance templates
- [x] Risk scoring algorithm
- [x] BYOAI compliance monitoring dashboard
- [ ] Citation and reference extraction

### Phase 4: Production Readiness (Week 7-8)
- [ ] Load testing and performance optimization
- [ ] Security audit and penetration testing
- [x] Comprehensive documentation
- [ ] Disaster recovery procedures
