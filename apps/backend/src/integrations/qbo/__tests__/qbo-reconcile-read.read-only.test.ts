// FIN-23 — guard: the QBO reconcile / modify-capture surface is strictly READ-ONLY.
// This statically asserts the shared read service and its route handlers issue no SQL
// writes, register only GET endpoints, and never import a QBO write client.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE = path.resolve(__dirname, "../qbo-reconcile-read.service.ts");
const ROUTES = path.resolve(__dirname, "../../../accounting/qbo-reconcile-captures.routes.ts");

const serviceSrc = readFileSync(SERVICE, "utf8");
const routesSrc = readFileSync(ROUTES, "utf8");

// Mutating SQL verbs that must never appear in either file.
const WRITE_SQL = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|DROP\s|TRUNCATE|CREATE\s|ALTER\s|MERGE\s+INTO|GRANT\s|UPSERT|RETURNING)\b/i;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("FIN-23 QBO reconcile captures — read-only", () => {
  it("service issues no mutating SQL", () => {
    expect(WRITE_SQL.test(stripComments(serviceSrc))).toBe(false);
  });

  it("route handlers issue no mutating SQL", () => {
    expect(WRITE_SQL.test(stripComments(routesSrc))).toBe(false);
  });

  it("registers GET endpoints only (no app.post/patch/put/delete)", () => {
    const code = stripComments(routesSrc);
    expect(/\bapp\.(post|patch|put|delete)\b/i.test(code)).toBe(false);
    expect(/\bapp\.get\b/.test(code)).toBe(true);
  });

  it("does not import a QBO write/entity-write client", () => {
    const imports = [serviceSrc, routesSrc].join("\n");
    expect(/qbo-entity-write/.test(imports)).toBe(false);
    expect(/qbo-client/.test(imports)).toBe(false);
    expect(/push\.service/.test(imports)).toBe(false);
  });

  it("is gated behind the OFF flag QBO_RECONCILE_UI_ENABLED", () => {
    expect(routesSrc.includes('process.env.QBO_RECONCILE_UI_ENABLED === "true"')).toBe(true);
  });

  // FIN-23 hardening: the RLS SELECT policy on these two tables scopes by the user's company
  // MEMBERSHIP, not the selected app.operating_company_id, so a multi-entity user would
  // otherwise see another entity's QBO rows. Every read must carry an EXPLICIT per-entity
  // predicate. These assertions lock that in so it can't silently regress.
  /** Extract a single exported function body from the service source by name. */
  function fnBody(name: string): string {
    const start = serviceSrc.indexOf(`export async function ${name}`);
    expect(start, `${name} not found in service`).toBeGreaterThanOrEqual(0);
    // Next exported function (or EOF) bounds this one's body.
    const after = serviceSrc.indexOf("\nexport async function ", start + 1);
    return serviceSrc.slice(start, after === -1 ? undefined : after);
  }

  it("listQboModifyCaptures carries an explicit operating_company_id predicate", () => {
    const body = fnBody("listQboModifyCaptures");
    // Threads operatingCompanyId in and pins the SELECT to it.
    expect(body).toMatch(/operatingCompanyId/);
    expect(body).toMatch(/operating_company_id = \$\$\{params\.length\}::uuid/);
  });

  it("listQboSyncConflicts carries an explicit operating_company_id predicate", () => {
    const body = fnBody("listQboSyncConflicts");
    expect(body).toMatch(/operatingCompanyId/);
    expect(body).toMatch(/operating_company_id = \$1::uuid/);
  });
});
