# Settings Page API Keys Updates Required

## Current State Analysis

Based on the settings page at https://observa-app.vercel.app/dashboard/settings:

### What's Currently Displayed:
1. **API Key Section**: Shows a single JWT-formatted API key
   - Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT format)
   - This key auto-detects tenant/project - ✅ Good for SDK
   
2. **Tenant ID**: Shown separately (can be copied)
   - Value: `4f62d2a5-6a34-4d53-a301-c0c661b0c4d6`
   
3. **Project ID**: Shown in Projects section
   - Value: `7aca92fe-ad27-41c2-bc0b-96e94dd2d165`

4. **Quick Start Code**: Uses JWT API key (works correctly)

### Issues Identified:

1. **No API Key Management**: The page doesn't show:
   - List of all API keys (from `/api/v1/tenants/:tenantId/api-keys`)
   - Ability to create new API keys (`sk_/pk_` format)
   - Ability to revoke/delete API keys
   - Different API key types (server keys vs publishable keys)

2. **Missing SDK Context**: When users create `sk_/pk_` format keys:
   - They need to see `tenantId` and `projectId` alongside the key
   - They need clear instructions that these keys require `tenantId`/`projectId` for SDK usage
   - The current JWT key example won't help them understand legacy key usage

3. **Incomplete Information**: The page doesn't explain:
   - Difference between JWT keys (from signup) and legacy keys (`sk_/pk_` from dashboard)
   - When to use which type of key
   - How to use legacy keys with the SDK

## Required Updates

### 1. Add API Key Management Section

**Endpoint to Use**: `GET /api/v1/tenants/:tenantId/api-keys`

**Response Format**:
```json
{
  "success": true,
  "apiKeys": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "projectId": "uuid" | null,
      "name": "My API Key",
      "keyPrefix": "sk_" | "pk_",
      "scopes": { "ingest": true, "query": false },
      "allowedOrigins": [],
      "revoked": false,
      "createdAt": "2024-01-01T00:00:00Z",
      "lastUsedAt": "2024-01-02T00:00:00Z" | null
    }
  ],
  "count": 1
}
```

**What to Display**:
- List of all API keys (active and revoked)
- Key name, type (`sk_` or `pk_`), creation date, last used
- **Important**: Show `tenantId` and `projectId` for each key
- Action buttons: Copy key (if just created), Revoke, Delete

### 2. Add API Key Creation Form

**Endpoint to Use**: `POST /api/v1/tenants/:tenantId/api-keys`

**Form Fields**:
- Name (required)
- Key Type: Server Key (`sk_`) or Publishable Key (`pk_`)
- Project (optional - can be tenant-level)
- Scopes: Ingest, Query
- Allowed Origins (for publishable keys)

**Response Includes**:
```json
{
  "success": true,
  "apiKey": "sk_...", // ⚠️ Only shown once!
  "keyRecord": {
    "tenantId": "uuid",
    "projectId": "uuid" | null,
    ...
  },
  "important": "When using this API key with the SDK, you may need to provide tenantId and projectId from keyRecord if using legacy key format (sk_ or pk_)."
}
```

**Display After Creation**:
- Show the API key prominently with a warning that it won't be shown again
- Display `tenantId` and `projectId` alongside the key
- Provide SDK initialization code with these values
- Show copy buttons for key, tenantId, and projectId

### 3. Update SDK Usage Instructions

**For JWT Keys** (current implementation - ✅ Keep as is):
```typescript
const observa = init({
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // JWT format
  apiUrl: 'https://observa-api.vercel.app',
});
```

**For Legacy Keys** (`sk_/pk_` format - ⚠️ Need to add):
```typescript
const observa = init({
  apiKey: 'sk_...', // Legacy format
  tenantId: '4f62d2a5-6a34-4d53-a301-c0c661b0c4d6', // Required!
  projectId: '7aca92fe-ad27-41c2-bc0b-96e94dd2d165', // Optional
  apiUrl: 'https://observa-api.vercel.app',
});
```

### 4. Suggested UI Layout

```
Settings Page
├── API Keys Section (New/Updated)
│   ├── Current JWT API Key (Keep existing)
│   │   └── Note: "This JWT key auto-detects tenant/project"
│   ├── API Key Management (New)
│   │   ├── "Create New API Key" Button
│   │   └── List of API Keys
│   │       ├── Key Name: "Production Key"
│   │       ├── Type: "sk_" (Server Key)
│   │       ├── Tenant ID: [Show + Copy]
│   │       ├── Project ID: [Show + Copy]
│   │       ├── Status: Active/Revoked
│   │       ├── Created: [Date]
│   │       └── Actions: [Revoke] [Delete]
│   └── Create API Key Modal/Form (New)
│       ├── Name input
│       ├── Type selector (sk_/pk_)
│       ├── Project selector (optional)
│       ├── Scopes checkboxes
│       └── Submit button
│
├── Company Information (Keep existing)
│   └── Tenant ID already shown ✅
│
├── Projects (Keep existing)
│   └── Project ID already shown ✅
│
└── Quick Start (Update)
    ├── Show code for JWT keys (current)
    └── Add toggle/tabs for legacy key examples
```

## Implementation Checklist

### Backend (✅ Already Complete):
- [x] `GET /api/v1/tenants/:tenantId/api-keys` - List all API keys
- [x] `POST /api/v1/tenants/:tenantId/api-keys` - Create API key (with tenantId/projectId in response)
- [x] `POST /api/v1/api-keys/resolve` - Resolve tenant/project from API key

### Frontend (❌ Needs Implementation):
- [ ] Fetch and display list of API keys
- [ ] Add "Create API Key" button/form
- [ ] Show tenantId and projectId for each legacy key
- [ ] Display SDK initialization code with correct values
- [ ] Add revoke/delete functionality
- [ ] Update Quick Start section with legacy key examples
- [ ] Add warning messages about when tenantId/projectId are required

## API Endpoints Reference

### List API Keys
```bash
GET /api/v1/tenants/:tenantId/api-keys
Authorization: Bearer <JWT_TOKEN>
```

### Create API Key
```bash
POST /api/v1/tenants/:tenantId/api-keys
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "name": "Production Key",
  "keyPrefix": "sk_",
  "projectId": "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
  "scopes": {
    "ingest": true,
    "query": true
  }
}
```

## Notes for Frontend Team

1. **Security**: API key values are only shown once when created. After that, only metadata is returned.

2. **JWT vs Legacy Keys**: 
   - JWT keys (current) work without tenantId/projectId
   - Legacy keys (`sk_/pk_`) require tenantId/projectId for SDK usage

3. **Display Priority**: Show `tenantId` and `projectId` prominently when displaying legacy keys - this prevents the error users are experiencing.

4. **Copy Functionality**: Provide separate copy buttons for:
   - API Key
   - Tenant ID
   - Project ID
   - Complete SDK config (all three values)

5. **User Education**: Add tooltips/help text explaining:
   - When to use JWT keys vs legacy keys
   - Why tenantId/projectId are needed for legacy keys
   - Where to find these values if they get lost

## Related Files

- Backend route: `src/routes/tenants.ts`
- Backend service: `src/services/apiKeyService.ts`
- API documentation: `docs/api/endpoints.md`
- SDK installation guide: `SDK_INSTALLATION_GUIDE.md`
