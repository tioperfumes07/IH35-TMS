#!/usr/bin/env node
/**
 * NEW-29/30/31 — dispatch-side click-confirm prompts (reefer lumper receipts-sent /
 * invoice-customer-too, late-arrival penalty decision).
 *
 * Locks three things that would otherwise silently regress:
 *   1. The route file registers all 3 endpoints (GET state, POST lumper, POST late-penalty) and
 *      is actually wired into apps/backend/src/index.ts (an unregistered route file is dead code
 *      — the exact "written but never wired" pattern this session already found twice elsewhere).
 *   2. The route never writes into Book Load's owned columns (lumper_required/lumper_paid_by are
 *      READ only) and never writes accounting.expense_lines — this is a dispatch-side prompt that
 *      records new decisions via audit.audit_events, not a re-implementation of Book Load or a
 *      reach into CC-1/AP's billing tables.
 *   3. The frontend card gates lumper prompts on is_reefer and the late-penalty prompt on a
 *      non-empty late_stops list, and is actually mounted in LoadDetailDrawer.tsx.
 */
import fs from "node:fs";

const ROUTE_REL = "apps/backend/src/dispatch/completion-prompts.routes.ts";
const INDEX_REL = "apps/backend/src/index.ts";
const CARD_REL = "apps/frontend/src/components/dispatch/LoadCompletionPromptsCard.tsx";
const DRAWER_REL = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function read(root, rel) {
  try {
    return fs.readFileSync(`${root}/${rel}`, "utf8");
  } catch {
    return null;
  }
}

export function run(root = process.cwd()) {
  const failures = [];

  const route = read(root, ROUTE_REL);
  if (route == null) {
    failures.push(`${ROUTE_REL}: missing`);
  } else {
    if (!/registerDispatchCompletionPromptsRoutes/.test(route)) {
      failures.push(`${ROUTE_REL}: must export registerDispatchCompletionPromptsRoutes`);
    }
    if (!/app\.get\(\s*"\/api\/v1\/dispatch\/loads\/:loadId\/completion-prompts"/.test(route)) {
      failures.push(`${ROUTE_REL}: missing GET state endpoint`);
    }
    if (!/app\.post\(\s*"\/api\/v1\/dispatch\/loads\/:loadId\/completion-prompts\/lumper"/.test(route)) {
      failures.push(`${ROUTE_REL}: missing POST lumper endpoint`);
    }
    if (!/app\.post\(\s*"\/api\/v1\/dispatch\/loads\/:loadId\/completion-prompts\/late-penalty"/.test(route)) {
      failures.push(`${ROUTE_REL}: missing POST late-penalty endpoint`);
    }
    // Must never write Book Load's owned columns or CC-1's billing table directly.
    if (/UPDATE\s+mdata\.load_stops\s+SET[\s\S]*lumper_required/.test(route)) {
      failures.push(`${ROUTE_REL}: must not write mdata.load_stops.lumper_required — that column is Book Load's write path`);
    }
    if (/UPDATE\s+accounting\.expense_lines/.test(route)) {
      failures.push(`${ROUTE_REL}: must not write accounting.expense_lines directly — that is CC-1/AP-owned; emit an audit event instead`);
    }
    if (!/audit\.audit_events|appendCrudAudit/.test(route)) {
      failures.push(`${ROUTE_REL}: decisions must be recorded via the audit-event pattern (appendCrudAudit / audit.audit_events)`);
    }
  }

  const index = read(root, INDEX_REL);
  if (index == null) {
    failures.push(`${INDEX_REL}: missing`);
  } else {
    if (!/registerDispatchCompletionPromptsRoutes/.test(index)) {
      failures.push(`${INDEX_REL}: registerDispatchCompletionPromptsRoutes is never imported/called — route is dead code`);
    } else {
      const imported = /import\s*\{\s*registerDispatchCompletionPromptsRoutes\s*\}\s*from\s*"\.\/dispatch\/completion-prompts\.routes\.js"/.test(index);
      const called = /await\s+registerDispatchCompletionPromptsRoutes\(app\)/.test(index);
      if (!imported) failures.push(`${INDEX_REL}: missing import of registerDispatchCompletionPromptsRoutes`);
      if (!called) failures.push(`${INDEX_REL}: registerDispatchCompletionPromptsRoutes(app) is never awaited/called`);
    }
  }

  const card = read(root, CARD_REL);
  if (card == null) {
    failures.push(`${CARD_REL}: missing`);
  } else {
    if (!/showLumperBlock\s*=\s*prompts\.is_reefer/.test(card)) {
      failures.push(`${CARD_REL}: lumper block must gate on prompts.is_reefer`);
    }
    if (!/showLateBlock\s*=\s*prompts\.late_stops\.length\s*>\s*0/.test(card)) {
      failures.push(`${CARD_REL}: late-penalty block must gate on prompts.late_stops.length > 0`);
    }
    if (!/if \(!showLumperBlock && !showLateBlock\) return null;/.test(card)) {
      failures.push(`${CARD_REL}: card must render nothing when neither condition applies`);
    }
  }

  const drawer = read(root, DRAWER_REL);
  if (drawer == null) {
    failures.push(`${DRAWER_REL}: missing`);
  } else {
    if (!/import\s*\{\s*LoadCompletionPromptsCard\s*\}\s*from\s*"\.\/LoadCompletionPromptsCard"/.test(drawer)) {
      failures.push(`${DRAWER_REL}: LoadCompletionPromptsCard is never imported`);
    }
    if (!/<LoadCompletionPromptsCard\s/.test(drawer)) {
      failures.push(`${DRAWER_REL}: LoadCompletionPromptsCard is never rendered — card is dead code`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-dispatch-completion-prompts-"));
  const dirs = [
    "apps/backend/src/dispatch",
    "apps/backend/src",
    "apps/frontend/src/components/dispatch",
  ];
  for (const d of dirs) fs.mkdirSync(`${tmp}/${d}`, { recursive: true });

  const goodRoute = `
export async function registerDispatchCompletionPromptsRoutes(app) {
  app.get("/api/v1/dispatch/loads/:loadId/completion-prompts", async () => {});
  app.post("/api/v1/dispatch/loads/:loadId/completion-prompts/lumper", async () => {});
  app.post("/api/v1/dispatch/loads/:loadId/completion-prompts/late-penalty", async () => {
    await appendCrudAudit(client, user.uuid, "dispatch.late_penalty_decision", {});
  });
}
`;
  const goodIndex = `
import { registerDispatchCompletionPromptsRoutes } from "./dispatch/completion-prompts.routes.js";
async function boot() {
  await registerDispatchCompletionPromptsRoutes(app);
}
`;
  const goodCard = `
export function LoadCompletionPromptsCard() {
  const showLumperBlock = prompts.is_reefer;
  const showLateBlock = prompts.late_stops.length > 0;
  if (!showLumperBlock && !showLateBlock) return null;
}
`;
  const goodDrawer = `
import { LoadCompletionPromptsCard } from "./LoadCompletionPromptsCard";
function Drawer() {
  return <LoadCompletionPromptsCard loadId={load.id} operatingCompanyId={load.operating_company_id} />;
}
`;

  function write(files) {
    fs.writeFileSync(`${tmp}/${ROUTE_REL}`, files.route ?? goodRoute);
    fs.writeFileSync(`${tmp}/${INDEX_REL}`, files.index ?? goodIndex);
    fs.writeFileSync(`${tmp}/${CARD_REL}`, files.card ?? goodCard);
    fs.writeFileSync(`${tmp}/${DRAWER_REL}`, files.drawer ?? goodDrawer);
  }

  write({});
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  write({ index: goodIndex.replace("await registerDispatchCompletionPromptsRoutes(app);", "") });
  if (run(tmp).length === 0) throw new Error("FAIL to catch: route never called in index.ts");

  write({ route: goodRoute.replace(/UPDATE\s+mdata\.load_stops\s+SET[\s\S]*lumper_required/, "") + `
export async function registerDispatchCompletionPromptsRoutes(app) {
  app.get("/api/v1/dispatch/loads/:loadId/completion-prompts", async () => {});
  app.post("/api/v1/dispatch/loads/:loadId/completion-prompts/lumper", async () => {
    await client.query("UPDATE mdata.load_stops SET lumper_required = true WHERE id = $1", [id]);
  });
  app.post("/api/v1/dispatch/loads/:loadId/completion-prompts/late-penalty", async () => {
    await appendCrudAudit(client, user.uuid, "dispatch.late_penalty_decision", {});
  });
}` });
  if (run(tmp).length === 0) throw new Error("FAIL to catch: route writes mdata.load_stops.lumper_required directly");

  write({ card: goodCard.replace("if (!showLumperBlock && !showLateBlock) return null;", "") });
  if (run(tmp).length === 0) throw new Error("FAIL to catch: card no longer renders-nothing when neither condition applies");

  write({ drawer: goodDrawer.replace("<LoadCompletionPromptsCard", "{/* removed */}<div") });
  if (run(tmp).length === 0) throw new Error("FAIL to catch: card removed from drawer JSX");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-dispatch-completion-prompts-wired SELFTEST PASS (5/5)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-dispatch-completion-prompts-wired FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-dispatch-completion-prompts-wired OK — NEW-29/30/31 dispatch prompts registered, dispatch-owned (no write into Book Load/CC-1 tables), and mounted in the drawer");
