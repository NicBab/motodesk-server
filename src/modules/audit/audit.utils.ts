const DEFAULT_SENSITIVE_FIELDS = new Set([
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "accessToken",
  "refreshToken",
  "token",
  "tokenHash",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
  "apiKey",
  "privateKey",
]);

const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[CIRCULAR]";

//************************************************************** */

interface SanitizeAuditValueOptions {
  sensitiveFields?: ReadonlySet<string>;
  maxDepth?: number;
}

//************************************************************** */

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

//************************************************************** */

function isSensitiveField(
  key: string,
  sensitiveFields: ReadonlySet<string>,
): boolean {
  const normalizedKey = key.toLowerCase();

  return Array.from(sensitiveFields).some(
    (field) =>
      normalizedKey === field.toLowerCase(),
  );
}

//************************************************************** */

export function sanitizeAuditValue(
  value: unknown,
  options: SanitizeAuditValueOptions = {},
): unknown {
  const sensitiveFields =
    options.sensitiveFields ??
    DEFAULT_SENSITIVE_FIELDS;

  const maxDepth = options.maxDepth ?? 10;

  const visitedObjects = new WeakSet<object>();

  function sanitize(
    currentValue: unknown,
    depth: number,
  ): unknown {
    if (depth > maxDepth) {
      return "[MAX_DEPTH_REACHED]";
    }

    if (
      currentValue === null ||
      currentValue === undefined ||
      typeof currentValue === "string" ||
      typeof currentValue === "number" ||
      typeof currentValue === "boolean"
    ) {
      return currentValue;
    }

    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    if (currentValue instanceof Date) {
      return currentValue.toISOString();
    }

    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
      };
    }

    if (
      typeof currentValue === "object" &&
      currentValue !== null
    ) {
      if (visitedObjects.has(currentValue)) {
        return CIRCULAR_VALUE;
      }

      visitedObjects.add(currentValue);
    }

    if (Array.isArray(currentValue)) {
      return currentValue.map((item) =>
        sanitize(item, depth + 1),
      );
    }

    if (isPlainObject(currentValue)) {
      return Object.fromEntries(
        Object.entries(currentValue).map(
          ([key, entryValue]) => [
            key,
            isSensitiveField(
              key,
              sensitiveFields,
            )
              ? REDACTED_VALUE
              : sanitize(
                  entryValue,
                  depth + 1,
                ),
          ],
        ),
      );
    }

    return String(currentValue);
  }

  return sanitize(value, 0);
}

//************************************************************** */