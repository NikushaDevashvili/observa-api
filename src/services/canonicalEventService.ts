/**
 * Canonical Event Service
 * 
 * Handles forwarding canonical events to Tinybird/ClickHouse
 */

import { env } from "../config/env.js";
import { TinybirdCanonicalEvent } from "../types/events.js";

export class CanonicalEventService {
  /**
   * Forward canonical events to Tinybird (batch)
   * 
   * Note: Events should already be formatted (null fields omitted) before calling this method.
   * The formatting is done in the route handler to ensure attributes_json is also cleaned.
   */
  static async forwardToTinybird(
    events: any[] // Already formatted events (null fields omitted)
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const url = `${env.TINYBIRD_HOST}/v0/events?name=${encodeURIComponent(
      env.TINYBIRD_CANONICAL_EVENTS_DATASOURCE
    )}&format=ndjson`;
    
    // Convert formatted events to NDJSON
    const ndjson = events
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n";

    // DEBUG: Log feedback events being sent to Tinybird
    const feedbackEvents = events.filter((e: any) => e.event_type === "feedback");
    if (feedbackEvents.length > 0) {
      console.log(`[CanonicalEventService] 📝 Sending ${feedbackEvents.length} FEEDBACK events to Tinybird`);
      feedbackEvents.forEach((fe: any, i: number) => {
        console.log(`[CanonicalEventService] Feedback ${i+1} NDJSON: ${JSON.stringify(fe)}`);
        console.log(`[CanonicalEventService] Feedback ${i+1} attributes_json: ${fe.attributes_json}`);
      });
    }

    try {
      console.log(
        `[CanonicalEventService] Forwarding ${events.length} events to Tinybird at ${url}`
      );
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TINYBIRD_ADMIN_TOKEN}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
      });

      const responseText = await response.text().catch(() => "Could not read response");
      
      // Check if response is OK
      if (!response.ok) {
        console.error(
          `[CanonicalEventService] Tinybird API error: ${response.status} ${response.statusText}`
        );
        console.error(`[CanonicalEventService] Response body: ${responseText}`);
        
        // Log the first event for debugging
        if (events.length > 0) {
          console.error(
            `[CanonicalEventService] First event that failed:\n${JSON.stringify(events[0], null, 2)}`
          );
        }
        
        throw new Error(
          `Tinybird API error: ${response.status} ${response.statusText} - ${responseText}`
        );
      }

      // Parse response to check for errors in body (Tinybird sometimes returns 200 with errors)
      try {
        const responseJson = JSON.parse(responseText);
        if (responseJson.error || responseJson.errors) {
          const errorMsg = responseJson.error || JSON.stringify(responseJson.errors);
          console.error(
            `[CanonicalEventService] Tinybird returned error in response body: ${errorMsg}`
          );
          throw new Error(`Tinybird ingestion error: ${errorMsg}`);
        }
        
        // Check for success indicators
        const ingested = responseJson.ingested || responseJson.successful_inserts || events.length;
        console.log(
          `[CanonicalEventService] Successfully forwarded ${events.length} events to Tinybird (ingested: ${ingested})`
        );
      } catch (parseError) {
        // If response is not JSON, check if it's a success message
        if (responseText.includes("error") || responseText.includes("Error")) {
          console.error(
            `[CanonicalEventService] Tinybird response indicates error: ${responseText}`
          );
          throw new Error(`Tinybird ingestion error: ${responseText}`);
        }
        // If it's not JSON but doesn't contain "error", assume success
        console.log(
          `[CanonicalEventService] Successfully forwarded ${events.length} events to Tinybird (response: ${responseText.substring(0, 100)})`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[CanonicalEventService] Failed to forward events to Tinybird: ${errorMessage}`
      );
      throw new Error(`Failed to forward events to Tinybird: ${errorMessage}`);
    }
  }

  /**
   * Forward single event (convenience method)
   * Note: Event should already be formatted before calling this method.
   */
  static async forwardSingleEvent(
    event: any // Already formatted event
  ): Promise<void> {
    return this.forwardToTinybird([event]);
  }
}
