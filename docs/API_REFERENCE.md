# BYOAI Platform API Reference

Quick reference for all BYOAI Compliance Platform API endpoints.

## Base URL
```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication
All endpoints require Supabase authentication. Include the session token in requests.

---

## Organizations API

### GET /api/organizations
Fetch organization details with risk score and statistics.

**Response:**
```json
{
  "organization": {
    "id": "uuid",
    "name": "Company Name",
    "abn": "53004085616",
    "industry_sector": "healthcare",
    "size": "small",
    "subscription_tier": "professional"
  },
  "membership": {
    "role": "owner",
    "permissions": {
      "can_approve_tools": true,
      "can_create_policies": true
    }
  },
  "stats": {
    "risk_score": 45,
    "active_tools": 5,
    "members": 12,
    "pending_violations": 2
  }
}
```

### POST /api/organizations
Create new organization with ABN validation.

**Request:**
```json
{
  "name": "Company Name",
  "abn": "53004085616",
  "industry_sector": "healthcare",
  "size": "small",
  "subscription_tier": "professional"
}
```

### PUT /api/organizations
Update organization settings (Owner/Admin only).

**Request:**
```json
{
  "name": "Updated Name",
  "auto_risk_assessment": true,
  "byoai_enabled": true
}
```

---

## AI Tools Registry API

### GET /api/byoai/tools
List AI tools with filters.

**Query Parameters:**
- `status`: approved | pending | blocked | under_review
- `risk_level`: low | medium | high | critical

**Response:**
```json
{
  "tools": [
    {
      "id": "uuid",
      "tool_name": "ChatGPT",
      "tool_vendor": "OpenAI",
      "tool_type": "llm",
      "risk_level": "high",
      "approval_status": "pending",
      "processes_personal_info": true,
      "cross_border_disclosure": true,
      "privacy_act_compliant": false,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### POST /api/byoai/tools
Register new AI tool (auto risk assessment).

**Request:**
```json
{
  "tool_name": "ChatGPT",
  "tool_vendor": "OpenAI",
  "tool_type": "llm",
  "version": "GPT-4",
  "deployment_type": "cloud",
  "processes_personal_info": true,
  "processes_sensitive_info": false,
  "cross_border_disclosure": true,
  "data_residency": "US",
  "privacy_policy_url": "https://openai.com/privacy"
}
```

**Response:**
```json
{
  "tool": {
    "id": "uuid",
    "risk_level": "high",
    "approval_status": "pending",
    "last_risk_assessment_at": "2025-01-15T10:30:00Z"
  }
}
```

### PUT /api/byoai/tools
Approve/reject tool (Compliance Officer/Admin/Owner only).

**Request:**
```json
{
  "tool_id": "uuid",
  "approval_status": "approved",
  "approval_conditions": "No customer PII allowed"
}
```

### DELETE /api/byoai/tools?id=uuid
Soft delete tool (Admin/Owner only).

---

## Usage Monitoring API

### POST /api/byoai/monitor
Log AI usage with real-time policy enforcement.

**Request:**
```json
{
  "tool_id": "uuid",
  "session_id": "session_123",
  "data_classification": "internal",
  "contains_personal_info": false,
  "contains_sensitive_info": false,
  "prompt_text": "Analyze this contract",
  "prompt_token_count": 150,
  "response_token_count": 300,
  "estimated_cost_usd": 0.002,
  "use_case_category": "legal_analysis"
}
```

**Success Response (200):**
```json
{
  "logged": true,
  "usage_log_id": "uuid",
  "blocked": false,
  "compliance_flags": null,
  "tool_name": "ChatGPT"
}
```

**Blocked Response (403):**
```json
{
  "logged": true,
  "usage_log_id": "uuid",
  "blocked": true,
  "block_reason": "Sensitive information blocked by policy 'HIPAA Protection'",
  "compliance_flags": [
    {
      "policy_id": "uuid",
      "policy_name": "HIPAA Protection",
      "rule_violated": "sensitive_info_blocked",
      "severity": "critical"
    }
  ]
}
```

### GET /api/byoai/monitor
Get usage analytics.

**Query Parameters:**
- `period`: 24h | 7d | 30d | 90d (default: 7d)
- `tool_id`: Filter by specific tool

**Response:**
```json
{
  "analytics": {
    "total_requests": 1523,
    "blocked_requests": 12,
    "by_classification": {
      "public": 500,
      "internal": 800,
      "confidential": 200,
      "restricted": 23
    },
    "personal_info_usage": 245,
    "sensitive_info_usage": 23,
    "violations": 12,
    "total_cost": 45.67,
    "total_tokens": 2500000
  },
  "recent_logs": []
}
```

---

## Policy Management API

### GET /api/byoai/policies
Get active policies.

**Query Parameters:**
- `type`: data_handling | tool_approval | usage_limits | privacy_protection
- `templates=true`: Get industry templates instead

**Response:**
```json
{
  "policies": [
    {
      "id": "uuid",
      "policy_name": "Block Sensitive Data",
      "policy_type": "privacy_protection",
      "enforcement_level": "block",
      "rules": {
        "block_sensitive_info": true,
        "forbidden_data_types": ["restricted"]
      },
      "priority": 1,
      "is_active": true
    }
  ]
}
```

### GET /api/byoai/policies?templates=true
Get industry policy templates.

**Response:**
```json
{
  "templates": [
    {
      "name": "Australian Privacy Act Compliance",
      "description": "Ensures AI tools comply with Privacy Act 1988",
      "policy_type": "privacy_protection",
      "enforcement_level": "block",
      "rules": {
        "block_personal_info_external": true,
        "block_cross_border": true,
        "require_data_classification": true
      },
      "applicable_to": ["All industries"]
    }
  ]
}
```

### POST /api/byoai/policies
Create new policy (Compliance Officer/Admin/Owner only).

**Request:**
```json
{
  "policy_name": "Block Sensitive Healthcare Data",
  "policy_description": "Prevents patient info in external AI",
  "policy_type": "privacy_protection",
  "enforcement_level": "block",
  "rules": {
    "block_sensitive_info": true,
    "block_cross_border": true,
    "forbidden_data_types": ["restricted", "confidential"]
  },
  "priority": 1
}
```

### PUT /api/byoai/policies
Update policy enforcement or rules.

**Request:**
```json
{
  "policy_id": "uuid",
  "enforcement_level": "alert",
  "is_active": true
}
```

---

## Compliance Violations API

### GET /api/compliance/violations
Get violations with filtering.

**Query Parameters:**
- `severity`: info | warning | high | critical
- `status`: pending | acknowledged | under_investigation | remediated
- `reportable=true`: Only OAIC-reportable violations
- `period`: 7d | 30d | 90d | 365d | all (default: 30d)

**Response:**
```json
{
  "violations": [
    {
      "id": "uuid",
      "violation_type": "sensitive_info_blocked",
      "severity": "critical",
      "details": {
        "rule_violated": "block_sensitive_info",
        "message": "Attempted to process patient health records"
      },
      "remediation_status": "under_investigation",
      "reportable_to_oaic": true,
      "affected_data_subjects": 150,
      "created_at": "2025-01-15T10:30:00Z",
      "ai_tools_registry": {
        "tool_name": "ChatGPT",
        "tool_vendor": "OpenAI"
      }
    }
  ],
  "stats": {
    "total": 25,
    "by_severity": {
      "critical": 2,
      "high": 8,
      "warning": 10,
      "info": 5
    },
    "reportable_to_oaic": 2,
    "potential_privacy_breaches": 3
  }
}
```

### POST /api/compliance/violations
Create violation (usually auto-created by policy engine).

**Request:**
```json
{
  "user_id": "uuid",
  "tool_id": "uuid",
  "policy_id": "uuid",
  "violation_type": "sensitive_info_blocked",
  "severity": "critical",
  "details": {
    "message": "Sensitive data in external AI"
  }
}
```

### PUT /api/compliance/violations
Update remediation status (Compliance Officer/Admin/Owner only).

**Request:**
```json
{
  "violation_id": "uuid",
  "remediation_status": "remediated",
  "remediation_notes": "Blocked tool access, trained user",
  "remediation_steps": {
    "actions_taken": ["Tool access revoked", "User training completed"]
  }
}
```

---

## Compliance Frameworks API

### GET /api/compliance/frameworks
Get all Australian compliance frameworks.

**Response:**
```json
{
  "frameworks": [
    {
      "framework_code": "au_privacy_act",
      "framework_name": "Privacy Act 1988",
      "jurisdiction": "AU",
      "authority": "OAIC",
      "requirements": {
        "principles": ["APP1", "APP3", "APP6", "APP8", "APP11"],
        "requires_data_breach_notification": true
      }
    }
  ]
}
```

### POST /api/compliance/frameworks
Run compliance assessment.

**Request:**
```json
{
  "framework_code": "au_privacy_act"
}
```

**Response:**
```json
{
  "assessment": {
    "framework_code": "au_privacy_act",
    "framework_name": "Privacy Act 1988",
    "assessed_at": "2025-01-15T10:30:00Z",
    "compliance_score": 75,
    "max_score": 100,
    "findings": [
      {
        "requirement": "APP 1: Privacy policy exists",
        "compliant": true,
        "details": "Found 3 active policies",
        "severity": "high"
      },
      {
        "requirement": "APP 8: Cross-border controls",
        "compliant": false,
        "details": "2 tools transfer data cross-border",
        "severity": "critical",
        "recommendation": "Implement controls for cross-border AI usage"
      }
    ],
    "recommendations": [
      "Implement controls for cross-border AI tool usage",
      "Review and remediate all security incidents"
    ]
  }
}
```

---

## Error Responses

All endpoints return standard error responses:

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "abn",
      "message": "ABN must be 11 digits"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions to approve tools"
}
```

### 404 Not Found
```json
{
  "error": "No organization found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error message"
}
```

---

## Rate Limits

- **Free Tier**: 100 requests/minute
- **Starter**: 500 requests/minute
- **Professional**: 1000 requests/minute
- **Enterprise**: 5000 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642348800
```

---

## Webhooks (Future)

Coming soon: Webhook notifications for:
- High-severity violations
- OAIC-reportable breaches
- Tool approval requests
- Policy updates

---

## SDK Example (TypeScript)

```typescript
// Initialize client
const client = new CompliClient({
  url: 'https://api.compli.ai',
  apiKey: process.env.COMPLI_API_KEY
});

// Register tool
const tool = await client.tools.create({
  tool_name: 'ChatGPT',
  tool_vendor: 'OpenAI',
  tool_type: 'llm',
  processes_personal_info: true
});

// Log usage
const usage = await client.monitor.log({
  tool_id: tool.id,
  prompt_text: 'Analyze contract',
  data_classification: 'internal'
});

// Check if blocked
if (usage.blocked) {
  console.log('Blocked:', usage.block_reason);
}

// Run compliance check
const assessment = await client.compliance.assess('au_privacy_act');
console.log('Compliance score:', assessment.compliance_score);
```

---

## Testing

### Using cURL

```bash
# Get organization
curl -X GET https://api.compli.ai/api/organizations \
  -H "Authorization: Bearer YOUR_TOKEN"

# Register tool
curl -X POST https://api.compli.ai/api/byoai/tools \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "ChatGPT",
    "tool_vendor": "OpenAI",
    "tool_type": "llm"
  }'

# Log usage
curl -X POST https://api.compli.ai/api/byoai/monitor \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_id": "uuid",
    "prompt_text": "Analyze this",
    "data_classification": "internal"
  }'
```

### Using Postman

Import this collection: [Download Compli API Collection](#)

---

## Support

- **Documentation**: See [BYOAI_IMPLEMENTATION.md](BYOAI_IMPLEMENTATION.md)
- **Schema**: Check `supabase/migrations/`
- **Examples**: Review `src/scripts/seedDemo.ts`

---

**API Version**: 1.0
**Last Updated**: January 2025
**Privacy Act 1988 Compliant** ✓
