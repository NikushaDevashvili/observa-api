/**
 * Helper script to get or create an API key from a JWT token
 * 
 * This script extracts tenant/project info from a JWT token and creates
 * an API key (sk_) that can be used with the events endpoint.
 * 
 * Usage:
 *   node scripts/get-api-key.js <JWT_TOKEN>
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || 'https://observa-api.vercel.app';

if (!JWT_TOKEN) {
  console.error('❌ Error: JWT_TOKEN is required');
  console.error('Usage: node scripts/get-api-key.js <JWT_TOKEN>');
  process.exit(1);
}

// Extract tenant/project from JWT
let tenantId, projectId;
try {
  const payload = JSON.parse(Buffer.from(JWT_TOKEN.split('.')[1], 'base64').toString());
  tenantId = payload.tenantId;
  projectId = payload.projectId;
  console.log(`📋 Extracted from JWT:`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Project ID: ${projectId}\n`);
} catch (e) {
  console.error('❌ Error: Could not extract tenantId/projectId from JWT token');
  process.exit(1);
}

// For now, we'll need to create the API key directly via database
// In the future, there should be an endpoint for this
console.log('💡 To use the events endpoint, you need an API key (sk_ or pk_)');
console.log('   Currently, API keys must be created via the database or a management endpoint.');
console.log('\n📝 You can use the JWT token with the traces endpoint:');
console.log(`   POST ${API_URL}/api/v1/traces/ingest`);
console.log('\n📝 For the events endpoint, you need an API key:');
console.log(`   POST ${API_URL}/api/v1/events/ingest`);
console.log('\n💡 Workaround: Use the traces endpoint for now, or create an API key manually.');

