# Installation Guide

Complete installation instructions for Observa SDK and API.

## SDK Installation

### Prerequisites

- Node.js v18 or higher
- npm, yarn, or pnpm

### Install SDK

```bash
npm install observa-sdk
```

Or with yarn:

```bash
yarn add observa-sdk
```

Or with pnpm:

```bash
pnpm add observa-sdk
```

### Verify Installation

```bash
npm list observa-sdk
```

---

## API Setup (For Self-Hosting)

### Prerequisites

- Node.js v18+
- PostgreSQL database
- Tinybird account (for analytics)
- Vercel account (recommended) or other hosting

### Install Dependencies

```bash
cd observa-api
npm install
```

### Environment Variables

See [Environment Setup Guide](./../development/env-setup.md) for detailed instructions.

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `TINYBIRD_ADMIN_TOKEN` - Tinybird admin token
- `JWT_SECRET` - Secret for JWT signing (32+ characters)
- `TINYBIRD_HOST` - Tinybird API host

### Build and Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## Frontend Setup (observa-app)

### Prerequisites

- Node.js v18+
- Next.js 13+ (if using Next.js)

### Install Dependencies

```bash
cd observa-app
npm install
```

### Environment Variables

```env
NEXT_PUBLIC_API_URL=https://observa-api.vercel.app
```

### Run Development Server

```bash
npm run dev
```

---

## Docker Installation (Optional)

### API

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Run

```bash
docker build -t observa-api .
docker run -p 3000:3000 observa-api
```

---

## Verification

### Test SDK Installation

```typescript
import ObservaSDK from "observa-sdk";
console.log("SDK installed successfully!");
```

### Test API

```bash
curl https://observa-api.vercel.app/health
```

Should return: `{"status":"ok"}`

---

## Next Steps

- [Quick Start Guide](./quick-start.md)
- [SDK Installation Guide](./../sdk/installation.md)
- [Environment Setup](./../development/env-setup.md)

---

## Troubleshooting

See [Troubleshooting Guide](./../troubleshooting/common-issues.md) for common installation issues.

