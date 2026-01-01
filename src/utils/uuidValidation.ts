/**
 * UUID Validation Utilities
 *
 * Validates UUIDv4 format for public-facing IDs to prevent IDOR attacks
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUIDv4 format
 */
export function isValidUUIDv4(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") {
    return false;
  }
  return UUID_V4_REGEX.test(uuid);
}

/**
 * Validate multiple UUIDs
 */
export function validateUUIDs(...uuids: (string | undefined | null)[]): {
  valid: boolean;
  invalid?: string[];
} {
  const invalid: string[] = [];

  for (const uuid of uuids) {
    if (uuid && !isValidUUIDv4(uuid)) {
      invalid.push(uuid);
    }
  }

  return invalid.length === 0 ? { valid: true } : { valid: false, invalid };
}

/**
 * Middleware to validate UUID parameters in route
 */
export function validateUUIDParams(
  paramNames: string[]
): (req: any, res: any, next: any) => void {
  return (req, res, next) => {
    const invalidParams: string[] = [];

    for (const paramName of paramNames) {
      const value = req.params[paramName] || req.query[paramName];
      if (value && !isValidUUIDv4(value)) {
        invalidParams.push(paramName);
      }
    }

    if (invalidParams.length > 0) {
      return res.status(400).json({
        error: {
          code: "INVALID_PAYLOAD",
          message: "Invalid ID format",
          details: {
            validation_errors: invalidParams.map((param) => ({
              field: param,
              message: "must be a valid UUIDv4",
            })),
          },
        },
      });
    }

    next();
  };
}
