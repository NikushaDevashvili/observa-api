# SDK API Key Configuration Fix

## Problem

Users were getting the following error when copying API keys from the dashboard settings page:

```
Error: Observa SDK: tenantId and projectId are required when using legacy API key format. Either provide a JWT-formatted API key (which encodes tenant/project context) or explicitly provide tenantId and projectId in the config.
```

**Root Cause**: 
- Dashboard users copy API keys in `sk_...` or `pk_...` format (legacy format)
- These keys don't encode tenant/project info like JWT-formatted keys do
- The SDK requires either:
  1. JWT-formatted API keys (which auto-decode tenant/project), OR
  2. Explicit `tenantId` and `projectId` in the config

## Solution

### 1. Created API Key Resolve Endpoint

**Endpoint**: `POST /api/v1/api-keys/resolve`

Allows SDKs to automatically resolve `tenantId` and `projectId` from legacy API keys (`sk_...` or `pk_...` format) without requiring users to manually provide them.

**Request**:
```json
{
  "apiKey": "sk_..."
}
```

**Response**:
```json
{
  "success": true,
  "tenantId": "uuid",
  "projectId": "uuid" | null,
  "keyPrefix": "sk_" | "pk_",
  "scopes": {
    "ingest": true,
    "query": false
  }
}
```

**Files Created**:
- `src/routes/apiKeys.ts` - New route handler
- Registered in `src/index.ts` at `/api/v1/api-keys`

### 2. Updated Installation Guides

Updated all installation guides to clearly explain:
- The difference between JWT-formatted API keys (from signup) and legacy API keys (from dashboard)
- How to provide `tenantId` and `projectId` when using legacy keys
- Where to find `tenantId` and `projectId` in the dashboard

**Files Updated**:
- `SDK_INSTALLATION_GUIDE.md` - Comprehensive guide with troubleshooting section
- `docs/sdk/installation.md` - SDK-specific installation guide
- `docs/api/authentication.md` - API authentication documentation

### 3. Enhanced API Key Creation Response

Updated the API key creation endpoint to include a helpful message about `tenantId` and `projectId`:

**Files Updated**:
- `src/routes/tenants.ts` - Added `important` field to response

**Response Now Includes**:
```json
{
  "success": true,
  "apiKey": "sk_...",
  "keyRecord": {
    "tenantId": "uuid",
    "projectId": "uuid" | null,
    ...
  },
  "message": "API key created successfully...",
  "important": "When using this API key with the SDK, you may need to provide tenantId and projectId from keyRecord if using legacy key format (sk_ or pk_)."
}
```

## Usage Instructions

### For Users with JWT API Keys (from signup):
```typescript
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // JWT format - auto-detects tenant/project
});
```

### For Users with Legacy API Keys (from dashboard):
**Option 1: Provide tenantId/projectId explicitly**
```typescript
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // sk_... or pk_...
  tenantId: process.env.OBSERVA_TENANT_ID!, // From settings page
  projectId: process.env.OBSERVA_PROJECT_ID, // From settings page (optional)
});
```

**Option 2: SDK auto-resolves (requires internet connection)**
```typescript
// SDK can automatically call /api/v1/api-keys/resolve if tenantId/projectId not provided
const observa = new ObservaSDK({
  apiKey: process.env.OBSERVA_API_KEY!, // sk_... or pk_...
  // SDK will automatically resolve tenantId/projectId
});
```

## Finding tenantId and projectId

1. **From API Key Creation Response**: When creating an API key via `/api/v1/tenants/:tenantId/api-keys`, the response includes `keyRecord.tenantId` and `keyRecord.projectId`
2. **From Dashboard Settings**: Go to Settings → API Keys, tenantId and projectId are shown in the API key details
3. **From Account Endpoint**: Call `GET /api/v1/auth/account` to get your tenant and project IDs

## Testing

To test the resolve endpoint:
```bash
curl -X POST https://observa-api.vercel.app/api/v1/api-keys/resolve \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sk_..."}'
```

## Next Steps for SDK Team

The SDK should be updated to:
1. Detect if an API key is JWT-formatted or legacy format
2. If legacy format and `tenantId`/`projectId` not provided, automatically call `/api/v1/api-keys/resolve`
3. Cache the resolved `tenantId`/`projectId` to avoid repeated calls
4. Show a helpful error message if the resolve endpoint fails

## Files Changed

1. **New Files**:
   - `src/routes/apiKeys.ts` - API key resolution endpoint

2. **Modified Files**:
   - `src/index.ts` - Registered new route
   - `src/routes/tenants.ts` - Enhanced API key creation response
   - `SDK_INSTALLATION_GUIDE.md` - Updated with troubleshooting section
   - `docs/sdk/installation.md` - Updated SDK initialization instructions
   - `docs/api/authentication.md` - Added SDK usage examples

## Related Documentation

- [SDK Installation Guide](./SDK_INSTALLATION_GUIDE.md)
- [API Authentication Guide](./docs/api/authentication.md)
- [SDK Installation (Docs)](./docs/sdk/installation.md)
