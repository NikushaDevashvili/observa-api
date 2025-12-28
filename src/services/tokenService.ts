import jwt, { SignOptions } from "jsonwebtoken";
import { JWTPayload } from "../types.js";
import { env } from "../config/env.js";

/**
 * Token Service
 * Handles JWT generation and validation for tenant authentication
 */
export class TokenService {
  /**
   * Generate a JWT token for a tenant/project
   */
  static generateToken(payload: {
    tenantId: string;
    projectId: string;
    environment?: "dev" | "prod";
  }): string {
    const jwtPayload = {
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      environment: payload.environment ?? "dev",
    };

    return jwt.sign(jwtPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as SignOptions);
  }

  /**
   * Validate and decode a JWT token
   */
  static validateToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      // Token invalid, expired, or malformed
      return null;
    }
  }

  /**
   * Extract tenant context from JWT (without full validation)
   * Used for debugging/logging
   */
  static decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch {
      return null;
    }
  }
}
