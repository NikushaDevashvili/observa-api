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
   */
  static async forwardToTinybird(
    events: TinybirdCanonicalEvent[]
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const url = `${env.TINYBIRD_HOST}/v0/events?name=${encodeURIComponent(
      "canonical_events" // New datasource name for canonical events
    )}&format=ndjson`;

    // Convert events to NDJSON
    const ndjson = events
      .map((event) => JSON.stringify(event))
      .join("\n") + "\n";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TINYBIRD_ADMIN_TOKEN}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error(
          `[CanonicalEventService] Tinybird API error: ${response.status} ${response.statusText} - ${errorText}`
        );
        throw new Error(
          `Tinybird API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      console.log(
        `[CanonicalEventService] Successfully forwarded ${events.length} events to Tinybird`
      );
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
   */
  static async forwardSingleEvent(
    event: TinybirdCanonicalEvent
  ): Promise<void> {
    return this.forwardToTinybird([event]);
  }
}

