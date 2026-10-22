/**
 * LEAD 443.219 G-STRICT (runtime audit 10-21, ~/Downloads/10-21-2026-LEAD-AUDIT2-FRONTEND-BACKEND-RUNTIME.md): a list route
 * whose query schema silently drops a parameter the screen sends (unit_id, `to`, a filter renamed on one side) returns the
 * WRONG list with a 200 — nobody sees it. ONE rule for every list query schema:
 *   - non-production (dev, test, CI): unknown query keys are a 400 (z.strictObject behaviour) — the drop fails loudly;
 *   - production: the request is served, the unknown keys are LOGGED (never silently ignored) and stripped.
 */
import { z } from "zod";

type Logger = (message: string, detail: Record<string, unknown>) => void;
const defaultLogger: Logger = (message, detail) => console.warn(message, detail);

export function strictListQuery<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  label: string,
  opts: { env?: string; log?: Logger } = {},
) {
  const env = opts.env ?? process.env.NODE_ENV;
  if (env !== "production") return schema.strict();
  const log = opts.log ?? defaultLogger;
  const known = new Set(Object.keys(schema.shape));
  return schema.loose().transform((value) => {
    const unknown = Object.keys(value).filter((k) => !known.has(k));
    if (unknown.length) log("strict_list_query_unknown_params", { route: label, params: unknown });
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) if (known.has(k)) out[k] = (value as Record<string, unknown>)[k];
    return out as z.infer<typeof schema>;
  });
}
