/**
 * Check if recent events are in Tinybird
 * 
 * Usage:
 *   node scripts/check-recent-events.js <JWT_TOKEN>
 */

const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://observa-api.vercel.app";

if (!JWT_TOKEN) {
  console.error("❌ Error: JWT_TOKEN is required");
  process.exit(1);
}

// Extract tenant/project from JWT
let tenantId, projectId;
try {
  const payload = JSON.parse(
    Buffer.from(JWT_TOKEN.split(".")[1], "base64").toString()
  );
  tenantId = payload.tenantId;
  projectId = payload.projectId;
} catch (e) {
  console.error("❌ Error: Could not extract tenantId/projectId from JWT token");
  process.exit(1);
}

async function checkRecentEvents() {
  try {
    console.log("🔍 Checking for recent events...\n");
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Project ID: ${projectId}\n`);

    // Check dashboard overview (last 24 hours)
    const overviewResponse = await fetch(
      `${API_URL}/api/v1/dashboard/overview?days=1`,
      {
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      }
    );

    if (overviewResponse.ok) {
      const overview = await overviewResponse.json();
      console.log("📊 Dashboard Overview (last 24h):");
      console.log(`  - Trace Count: ${overview.metrics?.trace_count || 0}`);
      console.log(`  - Error Rate: ${overview.metrics?.error_rate?.rate || 0}%`);
      console.log(`  - Active Issues: ${overview.metrics?.active_issues?.total || 0}`);
      console.log(`  - Success Rate: ${overview.metrics?.success_rate || 0}%\n`);
    } else {
      const error = await overviewResponse.text();
      console.error("❌ Dashboard overview error:", error);
    }

    // Check issues
    const issuesResponse = await fetch(
      `${API_URL}/api/v1/issues?limit=10`,
      {
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      }
    );

    if (issuesResponse.ok) {
      const issues = await issuesResponse.json();
      console.log("🚨 Recent Issues:");
      console.log(`  - Total Issues: ${issues.issues?.length || 0}`);
      if (issues.issues && issues.issues.length > 0) {
        issues.issues.slice(0, 5).forEach((issue, i) => {
          console.log(`  ${i + 1}. ${issue.issue_type} (${issue.severity}) - ${new Date(issue.timestamp).toLocaleString()}`);
        });
      }
    } else {
      const error = await issuesResponse.text();
      console.error("❌ Issues query error:", error);
    }

    console.log("\n💡 Next Steps:");
    console.log("1. Check Tinybird dashboard → canonical_events datasource");
    console.log("2. Check if events are in quarantine → canonical_events_quarantine");
    console.log("3. If quarantined, click a row to see the error message");
    console.log("4. Share the error message so we can fix the schema mismatch");

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkRecentEvents();

