/**
 * Test different timestamp formats
 */

import dotenv from "dotenv";
dotenv.config();

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || "https://api.europe-west2.gcp.tinybird.co";
const TINYBIRD_ADMIN_TOKEN = process.env.TINYBIRD_ADMIN_TOKEN;

if (!TINYBIRD_ADMIN_TOKEN) {
  console.error("❌ Error: TINYBIRD_ADMIN_TOKEN is required");
  process.exit(1);
}

const url = `${TINYBIRD_HOST}/v0/events?name=${encodeURIComponent("canonical_events")}&format=ndjson`;

// Generate valid UUIDs
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function testTimestampFormat(timestamp, formatName) {
  const event = {
    tenant_id: "4f62d2a5-6a34-4d53-a301-c0c661b0c4d6",
    project_id: "7aca92fe-ad27-41c2-bc0b-96e94dd2d165",
    environment: "prod",
    trace_id: generateUUID(),
    span_id: generateUUID(),
    timestamp: timestamp,
    event_type: "trace_start",
    attributes_json: "{}",
  };

  console.log(`\n🧪 Testing timestamp format: ${formatName}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Full event: ${JSON.stringify(event, null, 2)}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_ADMIN_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: JSON.stringify(event) + "\n",
    });

    const responseText = await response.text();
    const result = JSON.parse(responseText);
    
    if (result.successful_rows > 0) {
      console.log(`✅ SUCCESS! Format "${formatName}" works!`);
      return true;
    } else {
      console.log(`❌ Still quarantined`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const now = new Date();
  
  // Test different timestamp formats
  const formats = [
    { value: now.toISOString(), name: "ISO 8601 (toISOString)" },
    { value: now.toISOString().replace('Z', ''), name: "ISO 8601 without Z" },
    { value: Math.floor(now.getTime() / 1000).toString(), name: "Unix timestamp (seconds)" },
    { value: now.getTime().toString(), name: "Unix timestamp (milliseconds)" },
    { value: now.toISOString().split('.')[0] + 'Z', name: "ISO without milliseconds" },
  ];

  for (const format of formats) {
    const success = await testTimestampFormat(format.value, format.name);
    if (success) {
      console.log(`\n🎉 Found working format: ${format.name}`);
      break;
    }
  }
}

runTests();

