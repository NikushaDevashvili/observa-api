# Observa API

Backend API service for Observa - handles authentication, tenant management, and trace ingestion.

## Features

- **Authentication**: User signup and login with automatic token provisioning
- **Per-Tenant Token Security**: Each tenant gets a unique Tinybird token for isolation
- **JWT Authentication**: Secure API key generation for SDK usage
- **Trace Ingestion**: High-performance trace and event ingestion (NDJSON and JSON array support)
- **Real-time Analytics**: Dashboard with metrics, alerts, and insights
- **ML Analysis**: Hallucination detection, quality scoring, and issue detection
- **Session & Conversation Tracking**: Track user sessions and conversations
- **Cost Monitoring**: Track and analyze LLM costs by model and route
- **Issue Detection**: Automatic detection of errors, anomalies, and quality issues
- **Export & Integration**: Export traces (CSV/JSON) and RESTful API
- **Health Monitoring**: Detailed health checks for all dependencies

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your `.env` file with required variables:
   - `DATABASE_URL`: PostgreSQL connection string (required)
   - `TINYBIRD_ADMIN_TOKEN`: Your Tinybird admin token (required)
   - `JWT_SECRET`: Secret for signing JWT tokens, minimum 32 characters (required)
   - `TINYBIRD_HOST`: Your Tinybird API host (required, default: `https://api.europe-west2.gcp.tinybird.co`)
   
   Optional variables:
   - `SENTRY_DSN`: Sentry error monitoring DSN
   - `REDIS_URL` or `UPSTASH_REDIS_URL`: Redis connection for analysis queue
   - `ANALYSIS_SERVICE_URL`: ML analysis service URL
   - `FRONTEND_URL`: Frontend application URL
   
   See [Environment Setup Guide](./docs/development/env-setup.md) for complete details.

4. Build and run:
```bash
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

## API Endpoints

### SDK Endpoints

- `POST /api/v1/events/ingest` - Ingest canonical events (primary endpoint, supports NDJSON and JSON array)
- `POST /api/v1/traces/ingest` - Legacy trace ingestion (backward compatibility)

### Dashboard Endpoints

- `GET /api/v1/traces` - List traces with filtering
- `GET /api/v1/traces/:traceId` - Get trace detail
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/conversations` - List conversations
- `GET /api/v1/users` - List users
- `GET /api/v1/issues` - List issues timeline
- `GET /api/v1/dashboard/overview` - Dashboard metrics overview
- `GET /api/v1/costs/overview` - Cost overview

### Authentication Endpoints

- `POST /api/v1/auth/signup` - Create account
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### System Endpoints

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check (includes DB, Tinybird, Redis, Analysis Service status)
- `GET /api/v1/version` - API version and deployment info
- `GET /api-docs` - Interactive API documentation (Swagger UI)

> **Complete API Reference**: See [API Endpoints Documentation](./docs/api/endpoints.md) for full details on all endpoints, request/response formats, and examples.

## Architecture

This is part of a multi-repo architecture:

- **`observa-sdk`**: npm package for customer SDK
- **`observa-api`** (this repo): Backend API service
- **`observa-app`**: Customer-facing web app (signup UI, dashboard)

### Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (Neon, Vercel Postgres, or Supabase)
- **Data Warehouse**: Tinybird (for trace storage and analytics)
- **Queue**: Redis/Upstash (optional, for analysis jobs)
- **Deployment**: Vercel (serverless functions)
- **Monitoring**: Sentry (optional)
- **Documentation**: Swagger/OpenAPI

## SDK Migration

If you're updating the SDK to use canonical events, see:
- **[SDK_MIGRATION_GUIDE.md](./SDK_MIGRATION_GUIDE.md)** - Step-by-step migration guide
- **[SDK_CANONICAL_EVENTS_REFERENCE.md](./SDK_CANONICAL_EVENTS_REFERENCE.md)** - Complete event format reference
- **[SDK_IMPLEMENTATION_EXAMPLE.md](./SDK_IMPLEMENTATION_EXAMPLE.md)** - Example implementation code

## Security

- Per-tenant Tinybird tokens for isolation
- JWT-based authentication for SDK
- Automatic token provisioning during signup
- Token revocation support

## Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

