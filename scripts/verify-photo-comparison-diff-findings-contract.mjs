#!/usr/bin/env node
import fs from "node:fs";

const SERVICE_PATH = "apps/backend/src/safety/photo-comparison/session.service.ts";
const ROUTES_PATH = "apps/backend/src/safety/photo-comparison/routes.ts";
const DETAIL_PATH = "apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx";

function errorsFor(service, routes, detail) {
  const errors = [];
  const require = (source, token, message) => {
    if (!source.includes(token)) errors.push(message);
  };
  require(routes, "diff_findings: z.array(anglePairFindingSchema).optional()", "manual override must reject arbitrary JSON findings");
  require(routes, "confidence: z.number().finite().min(0).max(1)", "finding confidence must use the canonical bounded contract");
  require(service, "normalizeSessionDiffFindings", "session reads must normalize the findings contract");
  require(service, 'status === "pending" || status === "analyzing"', "only pre-verdict sessions may normalize legacy empty objects");
  require(service, 'throw new Error("photo_comparison_diff_findings_invalid")', "completed malformed evidence must fail closed");
  require(service, "res.rows.map(normalizeSessionRow)", "list reads must apply the same contract as detail reads");
  require(detail, "readAngleFindings(session)", "detail must validate runtime evidence before flatMap");
  require(detail, "angleFindingsResult.invalid", "detail must render an honest malformed-evidence state");
  return errors;
}

const service = fs.readFileSync(SERVICE_PATH, "utf8");
const routes = fs.readFileSync(ROUTES_PATH, "utf8");
const detail = fs.readFileSync(DETAIL_PATH, "utf8");
const errors = errorsFor(service, routes, detail);
if (errors.length) {
  console.error(`verify-photo-comparison-diff-findings-contract FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service, routes.replace("z.array(anglePairFindingSchema).optional()", "z.unknown().optional()"), detail],
    [service, routes.replace(".finite().min(0).max(1)", ""), detail],
    [service.replaceAll("normalizeSessionDiffFindings", "removedNormalizer"), routes, detail],
    [service.replace('status === "pending" || status === "analyzing"', 'status === "manual_override"'), routes, detail],
    [service.replace('throw new Error("photo_comparison_diff_findings_invalid")', "return null"), routes, detail],
    [service.replace("res.rows.map(normalizeSessionRow)", "res.rows"), routes, detail],
    [service, routes, detail.replace("readAngleFindings(session)", "{ findings: session?.diff_findings ?? [], invalid: false }")],
    [service, routes, detail.replace("angleFindingsResult.invalid", "false")],
  ];
  const escaped = mutations
    .map(([s, r, d], index) => ({ index, errors: errorsFor(s, r, d) }))
    .filter((result) => result.errors.length === 0);
  if (escaped.length) {
    console.error(`verify-photo-comparison-diff-findings-contract --selftest FAIL ${escaped.length}/${mutations.length} mutation(s) escaped: ${escaped.map((result) => result.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`verify-photo-comparison-diff-findings-contract --selftest PASS ${mutations.length}/${mutations.length}`);
} else {
  console.log("verify-photo-comparison-diff-findings-contract PASS — exact writes, normalized reads, honest detail failure state");
}
