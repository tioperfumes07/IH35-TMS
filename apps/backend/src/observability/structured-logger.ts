export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogFields = {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  user_id?: string;
  company_id?: string;
  route?: string;
  latency_ms?: number;
  error_stack?: string;
  [key: string]: unknown;
};

export function formatStructuredLog(
  level: LogLevel,
  message: string,
  fields: Omit<StructuredLogFields, "timestamp" | "level" | "message"> = {}
): StructuredLogFields {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
}

export function writeStructuredLog(entry: StructuredLogFields): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

/** Root logger for modules without request context (health probes, cron). */
export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) =>
    writeStructuredLog(formatStructuredLog("debug", message, extra)),
  info: (message: string, extra?: Record<string, unknown>) =>
    writeStructuredLog(formatStructuredLog("info", message, extra)),
  warn: (message: string, extra?: Record<string, unknown>) =>
    writeStructuredLog(formatStructuredLog("warn", message, extra)),
  error: (message: string, error?: unknown, extra?: Record<string, unknown>) =>
    writeStructuredLog(
      formatStructuredLog("error", message, {
        ...extra,
        error_stack: error instanceof Error ? error.stack : error ? String(error) : undefined,
      })
    ),
};

export function createStructuredLogger(base: Pick<StructuredLogFields, "request_id" | "user_id" | "company_id" | "route">) {
  return {
    debug: (message: string, extra?: Record<string, unknown>) =>
      writeStructuredLog(formatStructuredLog("debug", message, { ...base, ...extra })),
    info: (message: string, extra?: Record<string, unknown>) =>
      writeStructuredLog(formatStructuredLog("info", message, { ...base, ...extra })),
    warn: (message: string, extra?: Record<string, unknown>) =>
      writeStructuredLog(formatStructuredLog("warn", message, { ...base, ...extra })),
    error: (message: string, error?: unknown, extra?: Record<string, unknown>) =>
      writeStructuredLog(
        formatStructuredLog("error", message, {
          ...base,
          ...extra,
          error_stack: error instanceof Error ? error.stack : error ? String(error) : undefined,
        })
      ),
  };
}
