import type { FastifyInstance } from "fastify";

/**
 * Tolerate an EMPTY body on `application/json` requests.
 *
 * Several POST actions carry ALL their inputs in the URL/query string and take no body — e.g.
 * `POST /api/v1/banking/categorization-rules/:id/apply-historical?operating_company_id=…&dry_run=true`.
 * The Electron desktop client (and browsers via `fetch`) send `Content-Type: application/json` with an
 * empty body on those calls. Fastify's DEFAULT JSON parser rejects an empty body with
 * `FST_ERR_CTP_EMPTY_JSON_BODY` (HTTP 400 "Body cannot be empty when content-type is set to
 * 'application/json'") BEFORE the handler runs — surfaced as a prod Sentry error on apply-historical.
 *
 * This installs a JSON content-type parser that maps an empty body to `{}` so the action runs; a
 * NON-empty body parses exactly as Fastify's default parser did (`JSON.parse`, 400 on malformed JSON).
 *
 * Must be installed on the ROOT app scope BEFORE routes are registered. Scoped webhook parsers that use
 * `parseAs: "buffer"` for signature verification are unaffected — Fastify encapsulation keeps a child
 * scope's parser within that plugin.
 */
export function installEmptyJsonBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const raw = typeof body === "string" ? body : "";
    if (raw.trim() === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });
}
