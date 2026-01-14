# JWT 401 Unauthorized Error Analysis

## Problem

Customers are getting 401 Unauthorized errors even though:

- ✅ JWT is correctly formatted
- ✅ JWT is not expired
- ✅ SDK successfully decodes the JWT (shows "Auth: JWT (auto-extracted)")
- ❌ Backend API returns 401: "Invalid or expired authentication token"

## Root Cause

The SDK **decodes** the JWT (without signature verification) to extract tenant/project info, but the backend **verifies** the JWT signature using `jwt.verify(token, env.JWT_SECRET)`.

When `jwt.verify()` fails, it means:

- The JWT signature doesn't match the backend's `JWT_SECRET`
- The JWT was generated with a different `JWT_SECRET` than what the backend is using

## Common Causes

### 1. Environment Mismatch

The JWT was generated in one environment (e.g., production) but the backend is running with a different `JWT_SECRET` (e.g., preview/staging).

**Solution**: Ensure the JWT is generated and used in the same environment, or use environment-specific JWT_SECRET values.

### 2. JWT_SECRET Changed After Token Generation

The JWT was generated with one `JWT_SECRET`, but the backend's `JWT_SECRET` was changed (e.g., redeployed with a new secret).

**Solution**:

- Regenerate the JWT token after updating `JWT_SECRET`
- Or roll back the `JWT_SECRET` change if tokens are still valid

### 3. Different Deployments/Environments

- Local development uses one `JWT_SECRET`
- Production uses another `JWT_SECRET`
- Preview deployments use yet another `JWT_SECRET`

**Solution**: Ensure tokens are generated in the same environment where they'll be used.

## Technical Details

### SDK Behavior (Client-side)

```typescript
// SDK only DECODES (doesn't verify signature)
function decodeJWT(token: string): JWTPayload | null {
  const parts = token.split(".");
  const payload = parts[1];
  // Base64 decode and parse JSON - NO SIGNATURE VERIFICATION
  return JSON.parse(decoded) as JWTPayload;
}
```

✅ This always works if the JWT format is correct (3 parts, valid base64)

### Backend Behavior (Server-side)

```typescript
// Backend VERIFIES the signature
static validateToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET); // ← SIGNATURE VERIFICATION
    return decoded;
  } catch (error) {
    return null; // Signature mismatch or token expired
  }
}
```

❌ This fails if `JWT_SECRET` doesn't match

## Solutions

### Immediate Fix

1. **Check JWT_SECRET consistency**:

   - Verify the `JWT_SECRET` in the backend environment matches the one used to generate the token
   - Check Vercel environment variables for production/preview/staging

2. **Regenerate the JWT token**:

   - If the `JWT_SECRET` changed, customers need to get a new JWT from `/api/v1/auth/account`
   - The old JWT will no longer work

3. **Check environment variables**:
   ```bash
   # On Vercel, check:
   # Dashboard → Project → Settings → Environment Variables
   # Ensure JWT_SECRET is set correctly for all environments
   ```

### Long-term Solutions

1. **Add better error logging**:

   - Log the specific JWT verification error (expired vs signature mismatch)
   - Help customers understand if the token is expired or using wrong secret

2. **Document JWT_SECRET requirements**:

   - Make it clear that JWT_SECRET must remain constant
   - Document that changing JWT_SECRET invalidates all existing tokens

3. **Consider token refresh**:
   - Implement token refresh mechanism
   - Or use longer-lived tokens with proper secret management

## Debugging Steps

1. **Check if JWT is expired** (already verified - not expired ✅)
2. **Check JWT_SECRET consistency**:
   - What secret was used to generate the token?
   - What secret is the backend using?
3. **Check environment**:
   - Is the token from production?
   - Is the backend in production?
   - Are they using the same JWT_SECRET?

## Expected Behavior

When a JWT signature doesn't match:

- SDK: ✅ Decodes successfully (no signature verification)
- Backend: ❌ Returns 401 (signature verification fails)

This is the exact error pattern customers are seeing.
