#!/usr/bin/env node
/**
 * FINDING: LV-BANKING-DRIVER-ESCROW-REGISTER-INVALID-UUID (carries ACCT-F5403) — found live
 * 2026-08-17 during Banking cell-level Live re-measure. `/banking/driver-escrow` (and the sibling
 * Factoring/Cash-Advance-Pool banking tabs) mounted "Failed to load the escrow ledger. Try
 * refreshing." Direct network trace: `GET /api/v1/banking/accounts/00000000-0000-0000-0000-000000000056/register`
 * returned `400 {"error":"validation_error","fieldErrors":{"id":["Invalid UUID"]}}`.
 *
 * ROOT CAUSE: `accountIdParamsSchema = z.object({ id: z.string().uuid() })` enforces the RFC 4122
 * version/variant nibbles (zod's `.uuid()` is NOT a bare hex-and-hyphen shape check). The three
 * sentinel ids `virtualKind()` matches against — factoring `…059`, escrow `…056`, advance_pool
 * `…060` — are all version "0", so every one of them has ALWAYS failed this validator before
 * `virtualKind()` was ever reached. The register endpoint has been unreachable for every virtual
 * account since it shipped.
 *
 * FIX: a new `registerAccountIdParamsSchema` accepts a real account UUID OR one of the three known
 * virtual sentinels (via `virtualKind(v) !== null`), used ONLY by the `/register` route. The other
 * two callers of the original `accountIdParamsSchema` (hide/unhide) act exclusively on real bank
 * accounts and correctly keep the strict RFC-UUID check — narrow, additive fix.
 *
 * Static check (always runs): the register route uses the widened schema (not the original strict
 * one), and the widened schema's refine consults virtualKind() so all three sentinel ids are
 * accepted alongside real UUIDs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-register-virtual-account-id-accepted";
const TARGET_REL = "apps/backend/src/banking/banking.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertRegisterAcceptsVirtualIds(source) {
  const errors = [];

  const registerRouteMatch = source.match(
    /app\.get\(\s*"\/api\/v1\/banking\/accounts\/:id\/register"[\s\S]{0,400}/,
  );
  if (!registerRouteMatch) {
    errors.push("GET /api/v1/banking/accounts/:id/register route not found");
    return errors;
  }
  const routeBody = registerRouteMatch[0];

  if (!/registerAccountIdParamsSchema\.safeParse\(req\.params/.test(routeBody)) {
    errors.push("register route does not parse params with registerAccountIdParamsSchema");
  }
  if (/(?<!register)accountIdParamsSchema\.safeParse\(req\.params/.test(routeBody)) {
    errors.push("register route still uses the strict accountIdParamsSchema");
  }

  const schemaMatch = source.match(/const registerAccountIdParamsSchema = z\.object\(\{[\s\S]*?\n\}\);/);
  if (!schemaMatch) {
    errors.push("registerAccountIdParamsSchema definition not found");
  } else if (!/virtualKind\(v\)\s*!==\s*null/.test(schemaMatch[0])) {
    errors.push("registerAccountIdParamsSchema does not consult virtualKind() to accept sentinel ids");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertRegisterAcceptsVirtualIds(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "register route reverted to the strict schema",
      live.replace(
        'const params = registerAccountIdParamsSchema.safeParse(req.params ?? {});\n    if (!params.success) return sendValidationError(reply, params.error);\n    const query = registerQuerySchema.safeParse(req.query ?? {});',
        'const params = accountIdParamsSchema.safeParse(req.params ?? {});\n    if (!params.success) return sendValidationError(reply, params.error);\n    const query = registerQuerySchema.safeParse(req.query ?? {});',
      ),
      "still uses the strict accountIdParamsSchema",
    ],
    [
      "widened schema no longer consults virtualKind()",
      live.replace(
        "id: z.string().refine((v) => virtualKind(v) !== null || z.string().uuid().safeParse(v).success, {",
        "id: z.string().refine((v) => z.string().uuid().safeParse(v).success, {",
      ),
      "does not consult virtualKind()",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertRegisterAcceptsVirtualIds(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertRegisterAcceptsVirtualIds(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
