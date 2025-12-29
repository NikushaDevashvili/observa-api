# Environment Variables Setup Guide

This guide explains **exactly where to get each environment variable** you need for Observa.

---

## 📋 Quick Checklist

### For `observa-api` (Backend API):
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `TINYBIRD_ADMIN_TOKEN` - From Tinybird dashboard
- ✅ `TINYBIRD_HOST` - Your Tinybird region URL
- ✅ `JWT_SECRET` - Generate a random secret
- ✅ `SENTRY_DSN` - From Sentry dashboard (optional but recommended)
- ✅ `ANALYSIS_SERVICE_URL` - Your Python service URL (after deployment)

### For `observa-app` (Frontend):
- ✅ `NEXT_PUBLIC_API_URL` - Your observa-api Vercel URL
- ✅ `NEXT_PUBLIC_SENTRY_DSN` - From Sentry dashboard (optional)
- ✅ `SENTRY_DSN` - Same as above (server-side)
- ✅ `SENTRY_ORG` - Your Sentry organization slug
- ✅ `SENTRY_PROJECT` - Your Sentry project name

---

## 🔧 Step-by-Step Instructions

### 1. DATABASE_URL (PostgreSQL)

**What it is:** Connection string to your PostgreSQL database where all user data, sessions, and analysis results are stored.

**Where to get it:**

#### Option A: Vercel Postgres (Recommended - Easiest)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your **observa-api** project
3. Go to **Storage** tab → Click **Create Database** → Select **Postgres**
4. Choose a name (e.g., "observa-db")
5. Select a region (choose closest to your users)
6. Click **Create**
7. Once created, go to **Storage** → Click on your database
8. Go to **.env.local** tab
9. Copy the `POSTGRES_URL` value - **this is your DATABASE_URL**

**Format:** `postgres://default:xxxxx@xxxxx.xxxxx.vercel-storage.com:5432/verceldb`

#### Option B: Supabase (Free tier available)
1. Go to [Supabase](https://supabase.com) and sign up
2. Create a new project
3. Go to **Settings** → **Database**
4. Find **Connection string** → **URI**
5. Copy the connection string
6. Replace `[YOUR-PASSWORD]` with your database password

**Format:** `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

#### Option C: Neon (Free tier available)
1. Go to [Neon](https://neon.tech) and sign up
2. Create a new project
3. Go to **Dashboard** → Your project
4. Click **Connection Details**
5. Copy the **Connection string**

**Format:** `postgresql://user:password@xxxxx.neon.tech/dbname?sslmode=require`

---

### 2. TINYBIRD_ADMIN_TOKEN

**What it is:** Your Tinybird admin token for sending trace data to Tinybird.

**Where to get it:**
1. Go to [Tinybird Dashboard](https://ui.tinybird.co)
2. Log in to your account
3. Click on your **profile icon** (top right) → **Tokens**
4. Find or create an **Admin Token** (has full access)
5. Click **Copy** or **Show** to reveal the token
6. Copy the entire token string

**Note:** If you don't have a Tinybird account:
- Sign up at [tinybird.co](https://tinybird.co)
- Create a new workspace
- Create a datasource called "traces" (or use the default name)

---

### 3. TINYBIRD_HOST

**What it is:** The API endpoint URL for your Tinybird region.

**Where to get it:**
1. Go to [Tinybird Dashboard](https://ui.tinybird.co)
2. Check your workspace **Settings** → **Region**
3. Use the corresponding URL:
   - **US East:** `https://api.us-east-1.aws.tinybird.co`
   - **EU West 2 (London):** `https://api.europe-west2.gcp.tinybird.co` (default)
   - **EU West 1 (Belgium):** `https://api.europe-west1.gcp.tinybird.co`

**Default:** `https://api.europe-west2.gcp.tinybird.co` (if you're not sure, use this)

---

### 4. JWT_SECRET

**What it is:** A secret key used to sign and verify authentication tokens. **Must be at least 32 characters.**

**How to generate it:**

**Option A: Using Node.js (Recommended)**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option B: Using OpenSSL**
```bash
openssl rand -hex 32
```

**Option C: Online Generator**
- Go to [randomkeygen.com](https://randomkeygen.com)
- Use a **CodeIgniter Encryption Keys** (256-bit)
- Copy the key

**Important:** 
- Keep this secret! Never commit it to GitHub
- Use the same secret in all environments (dev, staging, production)
- If you lose it, all existing sessions will be invalid

---

### 5. SENTRY_DSN (Optional but Recommended)

**What it is:** Sentry Data Source Name - used to send error reports and performance data to Sentry.

**Where to get it:**
1. Go to [Sentry.io](https://sentry.io) and sign up (free tier available)
2. Create a new **Organization** (or use existing)
3. Create a new **Project**:
   - **Platform:** Node.js (for observa-api)
   - **Platform:** Next.js (for observa-app)
4. After creating the project, you'll see **"Configure SDK"** page
5. Copy the **DSN** value (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

**For observa-api:**
- Create a **Node.js** project
- Copy the DSN → Use as `SENTRY_DSN`

**For observa-app:**
- Create a **Next.js** project
- Copy the DSN → Use as `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`

**Note:** Sentry is optional. If you don't set it, error monitoring will be disabled but the app will still work.

---

### 6. SENTRY_ORG and SENTRY_PROJECT

**What it is:** Your Sentry organization slug and project name (needed for Next.js Sentry integration).

**Where to get it:**
1. Go to [Sentry Dashboard](https://sentry.io)
2. Look at the URL: `https://sentry.io/organizations/YOUR-ORG-SLUG/projects/YOUR-PROJECT-NAME/`
3. **SENTRY_ORG** = `YOUR-ORG-SLUG` (the organization name in the URL)
4. **SENTRY_PROJECT** = `YOUR-PROJECT-NAME` (the project name in the URL)

**Example:**
- URL: `https://sentry.io/organizations/my-company/projects/observa-app/`
- `SENTRY_ORG` = `my-company`
- `SENTRY_PROJECT` = `observa-app`

---

### 7. ANALYSIS_SERVICE_URL

**What it is:** The URL of your Python ML analysis service (observa-analysis).

**Where to get it:**
1. **First, deploy the Python service** to one of these platforms:
   - **Railway** (recommended): [railway.app](https://railway.app)
   - **Render**: [render.com](https://render.com)
   - **Fly.io**: [fly.io](https://fly.io)
   - **Vercel** (Python runtime)

2. **After deployment**, you'll get a URL like:
   - Railway: `https://observa-analysis-production.up.railway.app`
   - Render: `https://observa-analysis.onrender.com`
   - Fly.io: `https://observa-analysis.fly.dev`

3. **Use that URL** as your `ANALYSIS_SERVICE_URL`

**Note:** This is optional. If not set, ML analysis will be skipped but trace ingestion will still work.

**Temporary:** For testing, you can use `http://localhost:8000` if running locally.

---

### 8. NEXT_PUBLIC_API_URL

**What it is:** The public URL of your observa-api backend (used by the frontend to make API calls).

**Where to get it:**
1. **Deploy observa-api to Vercel first** (see deployment steps)
2. After deployment, Vercel will give you a URL like:
   - `https://observa-api.vercel.app`
   - Or your custom domain: `https://api.observa.ai`

3. **Use that URL** as your `NEXT_PUBLIC_API_URL`

**Note:** This must be set **after** you deploy observa-api. You can update it later.

---

## 🚀 Setting Environment Variables in Vercel

### For observa-api:
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on **observa-api** project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - Click **Add New**
   - Enter **Name** (e.g., `DATABASE_URL`)
   - Enter **Value** (paste the value)
   - Select **Environments** (Production, Preview, Development - select all)
   - Click **Save**
5. Repeat for all variables

### For observa-app:
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on **observa-app** project
3. Go to **Settings** → **Environment Variables**
4. Add each variable (same process as above)

---

## 📝 Environment Variables Summary

### observa-api (Required):
```bash
DATABASE_URL=postgresql://...
TINYBIRD_ADMIN_TOKEN=xxxxx
TINYBIRD_HOST=https://api.europe-west2.gcp.tinybird.co
JWT_SECRET=xxxxx (32+ characters)
```

### observa-api (Optional):
```bash
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_ENVIRONMENT=production
ANALYSIS_SERVICE_URL=https://observa-analysis.railway.app
TINYBIRD_DATASOURCE_NAME=traces
```

### observa-app (Required):
```bash
NEXT_PUBLIC_API_URL=https://observa-api.vercel.app
```

### observa-app (Optional):
```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=observa-app
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

---

## ✅ Verification Checklist

After setting all variables:

1. **Deploy observa-api:**
   - Check Vercel deployment logs
   - Visit `https://your-api.vercel.app/health` - should return `{"status":"ok"}`

2. **Deploy observa-app:**
   - Check Vercel deployment logs
   - Visit `https://your-app.vercel.app` - should load without errors

3. **Test signup:**
   - Go to signup page
   - Create an account
   - Check if it redirects to dashboard

4. **Check Sentry (if configured):**
   - Go to Sentry dashboard
   - Trigger a test error
   - Should see error appear in Sentry

---

## 🆘 Troubleshooting

### "DATABASE_URL must be a valid URL"
- Make sure your connection string starts with `postgresql://` or `postgres://`
- Check for any spaces or line breaks in the value

### "JWT_SECRET must be at least 32 characters"
- Generate a new secret using the commands above
- Make sure it's at least 32 characters long

### "TINYBIRD_ADMIN_TOKEN is required"
- Make sure you copied the entire token (it's usually very long)
- Check that there are no spaces before/after

### Frontend can't connect to API
- Make sure `NEXT_PUBLIC_API_URL` is set correctly
- Check that observa-api is deployed and accessible
- Verify CORS is configured in observa-api

---

## 💡 Pro Tips

1. **Start with the essentials:**
   - Set `DATABASE_URL`, `TINYBIRD_ADMIN_TOKEN`, `JWT_SECRET` first
   - Deploy and test
   - Add Sentry and analysis service later

2. **Use Vercel Postgres:**
   - Easiest to set up
   - Automatically configured for Vercel
   - Free tier available

3. **Test locally first:**
   - Create a `.env` file in each project
   - Test with local values
   - Then copy to Vercel

4. **Keep secrets safe:**
   - Never commit `.env` files to GitHub
   - Use Vercel's environment variables (encrypted)
   - Rotate secrets periodically

---

## 📚 Additional Resources

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [Sentry Setup Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Tinybird Documentation](https://www.tinybird.co/docs)

---

**Need help?** Check the deployment logs in Vercel or review the error messages - they usually tell you exactly what's missing!

