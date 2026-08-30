#!/usr/bin/env node
/**
 * @matrix-built {"modules":["fuel"],"cols":["connectivity","qbo_chrome"],"leaves":["fraud_alerts"],"task":"CLASS-F6534-FUEL-FRAUD-ALERT-ACTION-LIFECYCLE","vertical":"class-sweep"}
 * Fraud-alert actions use company-snapshotted requests and the dismiss reason
 * lives in canonical product modal chrome, never a native prompt.
 */
import fs from "node:fs";
import process from "node:process";

const REGISTRY_FILE = "docs/specs/fuel/FUEL-FRAUD-ALERT-LIFECYCLE-CONTRACTS.json";
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
const FILE = registry.frontend_file;
const ROUTES_FILE = registry.routes_file;

function inspect(source, routesSource) {
  const errors = [];
  if (source.includes("window.prompt")) errors.push("native dismiss prompt remains");
  if (!source.includes("<Modal") || !source.includes('title="Dismiss fuel fraud alert"')) errors.push("canonical dismiss modal missing");
  if (!source.includes("dismissReason.trim()") || !source.includes("disabled={!dismissReason.trim()}")) errors.push("dismiss reason is not required");
  if (!source.includes("confirmDiscardOnClose") || !source.includes("isDirty={Boolean(dismissReason.trim())}")) errors.push("typed dismiss reason is not discard-protected");
  if (!source.includes("onRegisterAttemptClose") || !source.includes("onClick={attemptDismissClose}")) errors.push("footer Cancel bypasses confirm-aware close");
  if (!/useEffect\(\(\) => \{[\s\S]*investigateMut\.reset\(\)[\s\S]*confirmMut\.reset\(\)[\s\S]*dismissMut\.reset\(\)[\s\S]*\}, \[companyId\]\)/.test(source)) {
    errors.push("company transition does not reset all action state");
  }
  const scopedBodies = source.match(/operating_company_id: input\.companyId/g)?.length ?? 0;
  if (scopedBodies !== 3) errors.push("all three PATCH actions must use submitting company snapshot");
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 6) errors.push("all success/error callbacks must reject stale company context");
  const actionSnapshots = source.match(/companyId,[\s\S]{0,120}generation: lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (actionSnapshots < 3) errors.push("investigate/confirm/dismiss do not carry company generation");
  if (!source.includes('queryKey: ["fuel", "fraud-alerts", targetCompanyId]')) errors.push("refresh is not scoped to submitting company");
  if (!/const actionPending = investigateMut\.isPending \|\| confirmMut\.isPending \|\| dismissMut\.isPending/.test(source)) errors.push("fraud state transitions have no shared pending boundary");
  if ((source.match(/disabled=\{actionPending\}/g)?.length ?? 0) !== 3) errors.push("all three row actions must share the pending lock");
  if ((source.match(/if \(actionPending\) return;/g)?.length ?? 0) !== 3) errors.push("all three row handlers must reject concurrent transitions");
  if ((routesSource.match(/AND status = 'open'/g)?.length ?? 0) !== 1) errors.push("investigate must transition only an open alert");
  if ((routesSource.match(/AND status IN \('open', 'investigating'\)/g)?.length ?? 0) !== 2) errors.push("resolve actions must transition only unresolved open/investigating alerts");
  if ((routesSource.match(/\n\s+AND resolved_at IS NULL/g)?.length ?? 0) !== 3) errors.push("all three backend actions must reject resolved alerts");
  if ((routesSource.match(/fraud_alert_state_changed/g)?.length ?? 0) !== 3) errors.push("all three backend actions must disclose state conflicts as HTTP 409");
  if ((routesSource.match(/return reply\.code\(409\)\.send\(\{ error: alert\.error \}\)/g)?.length ?? 0) !== 3) errors.push("all three mounted actions must map state conflicts to HTTP 409");
  for (const action of registry.actions) {
    const routeStart = routesSource.indexOf(`app.patch("${action.path}"`);
    const nextRoute = routesSource.indexOf("\n  app.", routeStart + 1);
    const routeBlock = routeStart >= 0 ? routesSource.slice(routeStart, nextRoute >= 0 ? nextRoute : undefined) : "";
    if (!routeBlock.includes(action.status_predicate)) errors.push(`${action.path} is missing registry status transition predicate`);
    if (!routeBlock.includes("AND resolved_at IS NULL")) errors.push(`${action.path} can mutate a resolved alert`);
    if (!routeBlock.includes(registry.conflict_error) || !routeBlock.includes("reply.code(409)")) errors.push(`${action.path} does not fail visibly on state conflict`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const routesSource = fs.readFileSync(ROUTES_FILE, "utf8");
  const mutations = [
    [source.replace("setDismissTarget(row);", 'window.prompt("Dismiss reason");'), routesSource],
    [source.replace("confirmMut.reset();", "// planted: confirm reset removed"), routesSource],
    [source.replace("operating_company_id: input.companyId", "operating_company_id: companyId"), routesSource],
    [source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"), routesSource],
    [source.replace("confirmDiscardOnClose", ""), routesSource],
    [source.replace("onClick={attemptDismissClose}", "onClick={closeDismiss}"), routesSource],
    [source.replace("const actionPending = investigateMut.isPending || confirmMut.isPending || dismissMut.isPending", "const actionPending = false"), routesSource],
    [source.replace("disabled={actionPending}", "disabled={investigateMut.isPending}"), routesSource],
    [source.replace("if (actionPending) return;", "// planted: concurrent transition allowed"), routesSource],
    [source, routesSource.replace("AND status = 'open'", "")],
    [source, routesSource.replace("AND status IN ('open', 'investigating')", "")],
    [source, routesSource.replace("\n            AND resolved_at IS NULL", "")],
    [source, routesSource.replace("fraud_alert_state_changed", "not_found")],
    [source, routesSource.replace("return reply.code(409).send({ error: alert.error });", "return reply.send(alert);")],
  ];
  const missed = mutations
    .map(([candidateSource, candidateRoutes], index) => ({ index: index + 1, errors: inspect(candidateSource, candidateRoutes) }))
    .filter((candidate) => candidate.errors.length === 0);
  if (missed.length) {
    console.error(`verify-fuel-fraud-alert-action-lifecycle SELFTEST FAIL — ${missed.length}/${mutations.length} mutation(s) survived: ${missed.map((candidate) => candidate.index).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-fuel-fraud-alert-action-lifecycle selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"), fs.readFileSync(ROUTES_FILE, "utf8"));
if (errors.length) {
  console.error("verify-fuel-fraud-alert-action-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-fuel-fraud-alert-action-lifecycle PASS — product modal and company-isolated action lifecycle are wired");
