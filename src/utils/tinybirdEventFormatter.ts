/**
 * Utility to format events for Tinybird
 * 
 * Handles nullable field formatting based on Tinybird's strict type checking requirements.
 * For Nullable fields, we omit them if they're null/undefined rather than sending null.
 */

import { TinybirdCanonicalEvent } from "../types/events.js";

/**
 * Recursively remove null and undefined values from an object
 * This is used to clean attributes_json before stringifying
 */
export function cleanNullValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined; // Will be omitted in JSON.stringify
  }
  
  if (Array.isArray(obj)) {
    return obj
      .map(cleanNullValues)
      .filter((item) => item !== undefined);
  }
  
  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const cleanedValue = cleanNullValues(obj[key]);
        // Only include the key if the cleaned value is not undefined
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Format a TinybirdCanonicalEvent for ingestion
 * 
 * IMPORTANT: Based on the actual Tinybird schema:
 * - Required fields (nullable: false): tenant_id, project_id, environment, trace_id, span_id,
 *   timestamp, event_type, conversation_id, session_id, user_id, attributes_json
 * - Nullable fields: parent_span_id (can be null or omitted)
 * - Fields NOT in schema: agent_name, version, route (should NOT be sent)
 * - timestamp must be in DateTime64(3) format (ISO 8601 string works)
 * 
 * CRITICAL: conversation_id, session_id, and user_id are REQUIRED (not nullable),
 * so they must always be present. If the event doesn't have them, we need to provide
 * empty strings or default values.
 */
export function formatTinybirdEvent(event: TinybirdCanonicalEvent): any {
  // Build the event with only fields that exist in the Tinybird schema
  const formatted: any = {
    tenant_id: event.tenant_id,
    project_id: event.project_id,
    environment: event.environment,
    trace_id: event.trace_id,
    span_id: event.span_id,
    timestamp: event.timestamp, // DateTime64(3) - ISO 8601 string format
    event_type: event.event_type,
    // These are REQUIRED (not nullable) - must always be present
    conversation_id: event.conversation_id ?? "", // Empty string if null (required field)
    session_id: event.session_id ?? "", // Empty string if null (required field)
    user_id: event.user_id ?? "", // Empty string if null (required field)
    attributes_json: event.attributes_json,
  };

  // parent_span_id is nullable - only include if it has a value
  if (event.parent_span_id !== null && event.parent_span_id !== undefined) {
    formatted.parent_span_id = event.parent_span_id;
  }

  // DO NOT include agent_name, version, or route - they're not in the schema

  return formatted;
}

/**
 * Format multiple events for batch ingestion
 */
export function formatTinybirdEvents(events: TinybirdCanonicalEvent[]): any[] {
  return events.map(formatTinybirdEvent);
}

