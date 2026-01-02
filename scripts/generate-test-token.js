/**
 * Quick script to generate a test JWT token
 * 
 * Usage:
 *   node scripts/generate-test-token.js <tenantId> <projectId>
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get tenant and project IDs from command line or use defaults
const tenantId = process.argv[2] || '00000000-0000-0000-0000-000000000001';
const projectId = process.argv[3] || '00000000-0000-0000-0000-000000000002';

// Try to get JWT_SECRET from .env file
let jwtSecret = 'your-secret-key-change-in-production';
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/JWT_SECRET=(.+)/);
    if (match) {
      jwtSecret = match[1].trim();
    }
  }
} catch (e) {
  // Use default
}

const token = jwt.sign(
  {
    tenantId,
    projectId,
    environment: 'dev',
  },
  jwtSecret,
  {
    expiresIn: '24h',
  }
);

console.log('✅ Generated JWT Token:');
console.log(token);
console.log('\n📋 Token Details:');
console.log(`   Tenant ID: ${tenantId}`);
console.log(`   Project ID: ${projectId}`);
console.log(`   Environment: dev`);
console.log('\n💡 Use this token with:');
console.log(`   JWT_TOKEN="${token}" node scripts/load-simulation-events.js`);

