/**
 * Payload Limit Middleware
 * 
 * Enforces payload size limits (1MB per event, 5MB per batch)
 */

import { Request, Response, NextFunction } from "express";

const MAX_EVENT_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_BATCH_SIZE = 5 * 1024 * 1024; // 5MB

export function payloadLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);

  // Check batch size limit
  if (contentLength > MAX_BATCH_SIZE) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Event or batch exceeds size limit",
        details: {
          limit: MAX_BATCH_SIZE,
          received: contentLength,
          limit_type: "batch",
        },
      },
    });
    return;
  }

  // For NDJSON batch ingestion, we'll check per-line size during parsing
  // For single event JSON, content-length check above is sufficient
  
  next();
}

/**
 * Validate individual event size (call during parsing)
 */
export function validateEventSize(
  eventSize: number,
  eventIndex?: number
): { valid: boolean; error?: any } {
  if (eventSize > MAX_EVENT_SIZE) {
    return {
      valid: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Event exceeds size limit",
        details: {
          limit: MAX_EVENT_SIZE,
          received: eventSize,
          limit_type: "event",
          event_index: eventIndex,
        },
      },
    };
  }
  return { valid: true };
}

