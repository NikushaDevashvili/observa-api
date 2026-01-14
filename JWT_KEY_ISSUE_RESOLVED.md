# JWT API Key Issue - Resolved

## Problem
User reported that JWT API keys from the settings page weren't being recognized by the SDK, getting error:
```
Error: Observa SDK: tenantId and projectId are required when using legacy API key format
```

## Root Cause
The JWT key was valid and the SDK code was correct. The issue was that **the `.env` file wasn't being loaded** because:
1. The project uses ES modules (`"type": "module"` in package.json)
2. No `dotenv` package was installed
3. Node.js doesn't automatically load `.env` files
4. `process.env.OBSERVA_API_KEY` was `undefined`, causing the SDK to think it was a legacy key

## Solution
Added `dotenv` package and imported it in the code:

```javascript
import "dotenv/config";  // Add this line
import { init } from "observa-sdk";

const observa = init({
  apiKey: process.env.OBSERVA_API_KEY,  // Now properly loaded from .env
  apiUrl: "https://observa-api.vercel.app",
});
```

## Verification
After adding `dotenv`, the SDK successfully recognizes the JWT key:
```
🔗 [Observa] Auth: JWT (auto-extracted)
🔗 [Observa] Tenant: 4f62d2a5-6a34-4d53-a301-c0c661b0c4d6
🔗 [Observa] Project: 7aca92fe-ad27-41c2-bc0b-96e94dd2d165
```

## JWT Key Verification
The JWT key from the settings page (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`) is:
- ✅ Valid JWT format (3 parts separated by dots)
- ✅ Decodes correctly
- ✅ Contains `tenantId` and `projectId` 
- ✅ SDK code correctly detects it as JWT

## Separate Issue Found
There's an unrelated issue with `observeOpenAI()` method using `require()` which isn't available in ES modules. This needs to be fixed in the SDK to use dynamic `import()` instead, but it's a separate problem from the JWT key recognition.

## Conclusion
The JWT key issue is **RESOLVED**. The SDK correctly recognizes JWT keys when they're properly loaded from environment variables.
