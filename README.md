# Observa API

Backend API service for Observa - handles customer onboarding, tenant management, and trace ingestion.

## Features

- **Automated Customer Onboarding**: Self-service signup with automatic token provisioning
- **Per-Tenant Token Security**: Each tenant gets a unique Tinybird token for isolation
- **JWT Authentication**: Secure API key generation for SDK usage

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - `TINYBIRD_ADMIN_TOKEN`: Your Tinybird admin token (with permissions to create tokens)
   - `JWT_SECRET`: Secret for signing JWT tokens
   - `TINYBIRD_HOST`: Your Tinybird API host
   - `TINYBIRD_DATASOURCE_NAME`: Name of your traces datasource

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

### POST /api/v1/onboarding/signup

Customer signup endpoint that automatically:
- Creates a tenant
- Creates a default "Production" project
- Provisions Tinybird token (per-tenant)
- Generates JWT API key
- Returns API key ready for SDK use

**Request:**
```json
{
  "email": "user@company.com",
  "companyName": "Acme Corp",
  "plan": "free"
}
```

**Response:**
```json
{
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenantId": "abc-123-...",
  "projectId": "def-456-...",
  "environment": "prod",
  "message": "Welcome! Your API key is ready to use."
}
```

## Architecture

This is part of a multi-repo architecture:

- **`observa-sdk`**: npm package for customer SDK
- **`observa-api`** (this repo): Backend API service
- **`observa-app`**: Customer-facing web app (signup UI, dashboard)

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

