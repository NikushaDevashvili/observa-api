/**
 * NDJSON Body Parser Middleware
 * 
 * Parses NDJSON (newline-delimited JSON) request bodies
 */

import { Request, Response, NextFunction } from "express";
import express from "express";

/**
 * Middleware to parse NDJSON bodies as text (before JSON parsing)
 * This should be applied before the main JSON parser
 */
export function ndjsonParserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.headers["content-type"] || "";
  
  if (contentType.includes("application/x-ndjson")) {
    // Use text parser for NDJSON
    express.text({ limit: "5mb", type: "application/x-ndjson" })(
      req,
      res,
      next
    );
  } else {
    // Let JSON parser handle it
    next();
  }
}

