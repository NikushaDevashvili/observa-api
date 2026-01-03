/**
 * Request ID Middleware
 * 
 * Generates a unique request ID for each request and adds it to:
 * - Response headers (X-Request-ID)
 * - Request object (for logging)
 * - Error responses
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Middleware to generate and attach request ID
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction
): void {
  // Generate unique request ID
  const requestId = randomUUID();
  
  // Attach to request object for use in routes/services
  req.requestId = requestId;
  
  // Add to response headers
  res.setHeader("X-Request-ID", requestId);
  
  // Add to response locals for error handlers
  res.locals.requestId = requestId;
  
  next();
}

