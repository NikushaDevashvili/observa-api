/**
 * Test dashboard health endpoint
 * 
 * Usage:
 *   node scripts/test-dashboard-health.js <session-token>
 * 
 * Or get session token from login first
 */

const API_URL = process.env.API_URL || "https://observa-api.vercel.app";
const SESSION_TOKEN = process.argv[2] || process.env.SESSION_TOKEN;

if (!SESSION_TOKEN) {
  console.error("❌ Error: Session token required");
  console.error("Usage: node scripts/test-dashboard-health.js <session-token>");
  console.error("\n💡 To get a session token:");
  console.error("   1. Login via /api/v1/auth/login");
  console.error("   2. Use the returned session token");
  process.exit(1);
}

async function testHealthEndpoint() {
  console.log("\n🏥 Testing Dashboard Health Endpoint");
  console.log("===================================\n");
  console.log(`API URL: ${API_URL}`);
  console.log(`Token: ${SESSION_TOKEN.substring(0, 20)}...\n`);

  try {
    const response = await fetch(`${API_URL}/api/v1/dashboard/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SESSION_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      console.log(`❌ Error Response:`);
      console.log(responseText);
      return;
    }

    try {
      const data = JSON.parse(responseText);
      console.log("✅ Health Check Results:\n");
      console.log(JSON.stringify(data, null, 2));

      if (data.diagnostics) {
        console.log("\n📊 Test Results Summary:");
        const tests = data.diagnostics.tests || {};
        for (const [testName, result] of Object.entries(tests)) {
          if (result.success) {
            console.log(`  ✅ ${testName}: Success`);
            if (typeof result.value === "object") {
              console.log(`     Value: ${JSON.stringify(result.value).substring(0, 100)}...`);
            } else {
              console.log(`     Value: ${result.value}`);
            }
          } else {
            console.log(`  ❌ ${testName}: Failed`);
            console.log(`     Error: ${result.error}`);
          }
        }

        console.log("\n🔑 Tinybird Token Status:");
        const tokenInfo = data.diagnostics.tinybird_token || {};
        console.log(`  Configured: ${tokenInfo.configured ? "✅ Yes" : "❌ No"}`);
        console.log(`  Length: ${tokenInfo.token_length}`);
        console.log(`  Prefix: ${tokenInfo.token_prefix}`);
      }
    } catch (e) {
      console.log("⚠️  Response is not JSON:");
      console.log(responseText);
    }
  } catch (error) {
    console.error("❌ Request failed:", error.message);
  }
}

testHealthEndpoint().catch(console.error);

