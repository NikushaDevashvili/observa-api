# Environment Variables Quick Reference

## 🎯 Priority Order (Set These First)

### 1. Essential (Required for Basic Functionality)
- [ ] `DATABASE_URL` - Get from Vercel Postgres / Supabase / Neon
- [ ] `TINYBIRD_ADMIN_TOKEN` - Get from Tinybird dashboard → Tokens
- [ ] `TINYBIRD_HOST` - Use `https://api.europe-west2.gcp.tinybird.co` (default)
- [ ] `JWT_SECRET` - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 2. Frontend Connection
- [ ] `NEXT_PUBLIC_API_URL` - Your observa-api Vercel URL (after deployment)

### 3. Optional (Add Later)
- [ ] `SENTRY_DSN` - Get from Sentry.io → Create Node.js project
- [ ] `ANALYSIS_SERVICE_URL` - Your Python service URL (after deployment)

---

## 📍 Where to Get Each Variable

| Variable | Where to Get It | Link |
|----------|----------------|------|
| `DATABASE_URL` | Vercel Dashboard → Storage → Create Postgres | [vercel.com](https://vercel.com) |
| `TINYBIRD_ADMIN_TOKEN` | Tinybird Dashboard → Profile → Tokens | [ui.tinybird.co](https://ui.tinybird.co) |
| `JWT_SECRET` | Generate locally (see command above) | - |
| `SENTRY_DSN` | Sentry.io → Create Project → Copy DSN | [sentry.io](https://sentry.io) |
| `ANALYSIS_SERVICE_URL` | After deploying Python service | Railway/Render/Fly.io |

---

## 🔗 Quick Links

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Tinybird Dashboard:** https://ui.tinybird.co
- **Sentry Dashboard:** https://sentry.io
- **Supabase:** https://supabase.com (alternative to Vercel Postgres)
- **Neon:** https://neon.tech (alternative to Vercel Postgres)

---

## ⚡ Quick Commands

### Generate JWT Secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Test Database Connection:
```bash
# After setting DATABASE_URL, test locally:
psql $DATABASE_URL -c "SELECT 1;"
```

---

## 📋 Vercel Setup Steps

1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add each variable (select all environments: Production, Preview, Development)
4. Redeploy after adding variables

---

**Full guide:** See `ENV_SETUP_GUIDE.md` for detailed instructions.

