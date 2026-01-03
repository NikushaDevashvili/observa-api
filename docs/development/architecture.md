# Architecture Overview

High-level architecture of the Observa system.

## System Architecture

```
┌─────────────────────────────────────────┐
│         Observa System                  │
│                                         │
│  ┌──────────────┐  ┌──────────────┐   │
│  │   Dashboard   │  │  API Server   │   │
│  │  (observa-app)│  │ (observa-api) │   │
│  └───────┬───────┘  └───────┬───────┘   │
│          │                  │           │
│          └────────┬──────────┘           │
│                   │                     │
│            ┌───────▼───────┐             │
│            │  PostgreSQL   │             │
│            │  (Control     │             │
│            │   Plane)      │             │
│            └───────┬───────┘             │
│                    │                     │
│            ┌───────▼───────┐             │
│            │   Tinybird    │             │
│            │  (Analytics   │             │
│            │   Data Plane) │             │
│            └───────────────┘             │
└─────────────────────────────────────────┘
```

## Components

### observa-api (Backend)

- **Purpose**: API server for SDK and dashboard
- **Tech**: Node.js, Express, TypeScript
- **Deployment**: Vercel serverless functions
- **Database**: PostgreSQL (control plane)
- **Analytics**: Tinybird (data plane)

### observa-app (Frontend)

- **Purpose**: Customer-facing dashboard
- **Tech**: Next.js, React, TypeScript
- **Deployment**: Vercel
- **API**: Calls observa-api

### observa-sdk (SDK)

- **Purpose**: Client library for integration
- **Tech**: TypeScript/JavaScript
- **Distribution**: npm package
- **Usage**: Installed in customer applications

## Data Flow

### Event Ingestion

```
Customer App → SDK → API → Tinybird + PostgreSQL
```

1. Customer app uses SDK
2. SDK accumulates events
3. SDK sends events to API (`/api/v1/events/ingest`)
4. API validates and forwards to Tinybird
5. API stores summaries in PostgreSQL

### Data Retrieval

```
Dashboard → API → Tinybird/PostgreSQL → Dashboard
```

1. Dashboard requests data
2. API queries Tinybird (analytics) or PostgreSQL (operational)
3. API returns formatted data
4. Dashboard displays data

## Data Storage

### PostgreSQL (Control Plane)

Stores:
- Users and authentication
- Tenants and projects
- API keys
- Trace summaries
- Sessions and conversations
- Audit logs

### Tinybird (Analytics Data Plane)

Stores:
- All canonical events
- Time-series data
- Optimized for analytical queries

## Security

- **Per-tenant isolation**: Each tenant has separate Tinybird token
- **API key authentication**: JWT-based for SDK
- **Session tokens**: For dashboard access
- **Rate limiting**: Per-tenant and per-IP
- **Quota management**: Monthly event limits

## Related Documentation

- [Environment Setup](./env-setup.md)
- [Deployment Guide](./deployment.md)
- [API Overview](../api/overview.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).

