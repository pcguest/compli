# BYOAI Compliance Platform - Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Clean Installation
```bash
# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify no TypeScript errors
npm run type-check

# Verify build succeeds
npm run build
```

### 2. Environment Setup

Create `.env.local` with all required variables:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI/LLM (Required)
ANTHROPIC_API_KEY=sk-ant-your-key
OPENAI_API_KEY=sk-your-openai-key

# Rate Limiting (Optional but recommended)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Email Notifications (Optional)
RESEND_API_KEY=re_your_key
NOTIFICATION_EMAIL_FROM=noreply@yourdomain.com

# Monitoring (Optional)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
NEXT_PUBLIC_POSTHOG_KEY=phc_your_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 3. Database Setup

```bash
# Option A: Using Supabase CLI
supabase link --project-ref your-project-ref
supabase db push

# Option B: Manual SQL execution
# Run each migration in order:
# 1. supabase/migrations/001_initial_schema.sql
# 2. supabase/migrations/002_rls_policies.sql
# 3. supabase/migrations/003_vector_search.sql
# 4. supabase/migrations/004_audit_logs.sql
# 5. supabase/migrations/005_byoai_compliance.sql
```

### 4. Seed Demo Data

```bash
# Set environment variables for seeding
export NEXT_PUBLIC_SUPABASE_URL=your_url
export SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Run seed script
npm run seed:demo
```

**Expected Output:**
```
🌱 Starting demo data seeding...
📊 Creating demo organizations...
✓ Created 3 organizations
🤖 Creating demo AI tools...
✓ Created 6 AI tools
📋 Creating demo policies...
✓ Created 3 policies
📊 Creating demo usage logs...
✓ Created 50 usage logs
⚠️  Creating demo compliance violations...
✓ Created 3 violations
🎯 Creating demo risk assessments...
✓ Created 6 risk assessments
✅ Demo data seeding completed successfully!
```

### 5. Verify API Endpoints

Test each endpoint is working:

```bash
# Start dev server
npm run dev

# Test organization endpoint (requires auth)
curl http://localhost:3000/api/organizations

# Test tools registry
curl http://localhost:3000/api/byoai/tools

# Test policy templates
curl http://localhost:3000/api/byoai/policies?templates=true

# Test compliance frameworks
curl http://localhost:3000/api/compliance/frameworks
```

---

## 🚀 Deployment Steps

### Vercel Deployment (Recommended)

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Configure Environment Variables**
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add all variables from `.env.local`
- Ensure `NODE_ENV=production` for production deployment

5. **Deploy to Production**
```bash
vercel --prod
```

### Alternative: Railway Deployment

1. **Install Railway CLI**
```bash
npm i -g @railway/cli
```

2. **Login and Deploy**
```bash
railway login
railway init
railway up
```

3. **Set Environment Variables**
```bash
railway variables set NEXT_PUBLIC_SUPABASE_URL=your_url
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_key
# ... repeat for all variables
```

---

## 🔍 Post-Deployment Verification

### 1. Health Checks

```bash
# Check homepage loads
curl -I https://your-domain.com

# Check API health
curl https://your-domain.com/api/compliance/frameworks

# Verify database connection
curl https://your-domain.com/api/organizations
```

### 2. Feature Testing

- [ ] User can sign up/sign in
- [ ] Organization can be created
- [ ] AI tool can be registered
- [ ] Risk score is calculated automatically
- [ ] Policy can be created
- [ ] Usage can be logged
- [ ] Violations are detected
- [ ] Compliance assessment runs

### 3. Security Verification

- [ ] RLS policies are enforced (users can't see other orgs' data)
- [ ] Service role key is not exposed in client
- [ ] CORS is properly configured
- [ ] Rate limiting is working (if Upstash configured)
- [ ] Audit logs are being created

### 4. Performance Testing

```bash
# Install Apache Bench
# Test API performance
ab -n 100 -c 10 https://your-domain.com/api/compliance/frameworks

# Expected: < 500ms average response time
```

---

## 📊 Monitoring Setup

### Sentry (Error Tracking)

1. Create Sentry project
2. Add Sentry DSN to environment variables
3. Verify errors are being captured

### PostHog (Analytics)

1. Create PostHog project
2. Add PostHog key to environment variables
3. Verify events are being tracked

### Supabase (Database Monitoring)

1. Go to Supabase Dashboard → Database → Query Performance
2. Monitor slow queries
3. Check RLS policy performance

---

## 🔒 Security Hardening

### Production Checklist

- [ ] Change all default passwords
- [ ] Enable MFA for Supabase dashboard
- [ ] Configure allowed domains in Supabase Auth
- [ ] Set up IP allowlisting (if needed)
- [ ] Enable Supabase database backups
- [ ] Configure CORS properly
- [ ] Set up rate limiting (Upstash)
- [ ] Enable Vercel/Railway DDoS protection
- [ ] Configure CSP headers
- [ ] Enable HTTPS only (no HTTP)

### Environment Variables Security

- [ ] Never commit `.env.local` to Git
- [ ] Rotate API keys quarterly
- [ ] Use different keys for staging/production
- [ ] Limit service role key usage to backend only
- [ ] Enable Supabase audit logging

---

## 🧪 Testing Scenarios

### Test Case 1: Tool Registration & Risk Assessment

```bash
# Register high-risk tool
POST /api/byoai/tools
{
  "tool_name": "ChatGPT",
  "processes_sensitive_info": true,
  "cross_border_disclosure": true
}

# Expected: risk_level = "high" or "critical"
```

### Test Case 2: Policy Enforcement

```bash
# Create blocking policy
POST /api/byoai/policies
{
  "policy_name": "Block Sensitive Data",
  "enforcement_level": "block",
  "rules": { "block_sensitive_info": true }
}

# Log usage with sensitive data
POST /api/byoai/monitor
{
  "tool_id": "...",
  "contains_sensitive_info": true,
  "prompt_text": "Sensitive data"
}

# Expected: Response status 403, blocked = true
```

### Test Case 3: Compliance Assessment

```bash
# Run Privacy Act assessment
POST /api/compliance/frameworks
{
  "framework_code": "au_privacy_act"
}

# Expected: compliance_score between 0-100, findings array
```

---

## 📈 Performance Benchmarks

### Expected Performance (Production)

| Endpoint | Target Response Time | Max Response Time |
|----------|---------------------|-------------------|
| GET /api/organizations | < 200ms | < 500ms |
| GET /api/byoai/tools | < 300ms | < 600ms |
| POST /api/byoai/monitor | < 400ms | < 800ms |
| POST /api/compliance/frameworks | < 1000ms | < 2000ms |
| GET /api/compliance/violations | < 300ms | < 600ms |

### Database Query Performance

- Organization risk score calculation: < 100ms
- Policy evaluation: < 50ms
- Usage log insertion: < 100ms
- Compliance assessment: < 500ms

---

## 🐛 Troubleshooting

### Issue: "Cannot find module" errors

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database migrations fail

**Solution:**
```bash
# Check Supabase connection
supabase db ping

# Reset and re-run migrations
supabase db reset
supabase db push
```

### Issue: TypeScript errors in IDE

**Solution:**
```bash
# Restart TypeScript server in VSCode
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# Or reinstall types
npm install --save-dev @types/node @types/react @types/react-dom
```

### Issue: API returns 500 errors

**Solution:**
1. Check Supabase logs in dashboard
2. Verify RLS policies are correct
3. Check environment variables are set
4. Review Sentry error tracking

### Issue: Demo seed fails

**Solution:**
```bash
# Ensure service role key is set
echo $SUPABASE_SERVICE_ROLE_KEY

# Check database is accessible
psql $DATABASE_URL

# Re-run migrations first
supabase db push
npm run seed:demo
```

---

## 📚 Documentation Reference

- [BYOAI_IMPLEMENTATION.md](BYOAI_IMPLEMENTATION.md) - Complete platform guide
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Executive summary
- [API_REFERENCE.md](API_REFERENCE.md) - Full API documentation
- [README.md](README.md) - Project overview

---

## ✅ Final Checklist

Before going live:

- [ ] All dependencies installed (`npm install`)
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)
- [ ] All migrations applied (`supabase db push`)
- [ ] Demo data seeded successfully (`npm run seed:demo`)
- [ ] Environment variables configured (production)
- [ ] Deployed to Vercel/Railway
- [ ] DNS configured and SSL enabled
- [ ] Monitoring enabled (Sentry, PostHog)
- [ ] Security hardening completed
- [ ] Performance benchmarks met
- [ ] Backup strategy configured
- [ ] Team members have access
- [ ] Documentation reviewed
- [ ] Compliance assessment passed

---

## 🎯 Success Criteria

Your deployment is successful when:

1. ✅ All API endpoints return 200/201 responses
2. ✅ Demo data is visible in Supabase dashboard
3. ✅ Tools Registry component renders correctly
4. ✅ Policy enforcement blocks violations
5. ✅ Compliance assessment generates scores
6. ✅ OAIC reporting works for violations
7. ✅ Risk scores are calculated automatically
8. ✅ Audit logs are being created
9. ✅ No TypeScript or build errors
10. ✅ Performance meets benchmarks

---

**Platform Ready!** 🚀

Your BYOAI Compliance Platform is now ready for production use.

**Next Steps:**
1. Create your first organization
2. Register your AI tools
3. Define organizational policies
4. Monitor usage in real-time
5. Generate compliance reports
