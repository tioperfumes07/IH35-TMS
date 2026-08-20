#!/usr/bin/env node
/**
 * ACCT-F5630 — assembleFactoringPacket() and sweepAndAssemblePackets() (factoring/packet-assemble.service.ts)
 * are complete, correct money-adjacent functions — the ONLY code that ever stamps a load's
 * IH35_FACTORING_PACKAGE_V1 packet metadata / auto-creates its from-load invoice on delivery+POD
 * approval — but had ZERO call sites anywhere in the backend. The file's own header comment CLAIMED a
 * live trigger ("wired by callers, e.g. pod.routes.ts on POD approval") that did not exist.
 *
 * This guard proves: (1) pod.routes.ts's POD-review route actually calls assembleFactoringPacket on
 * approval, (2) a sweep cron exists and is registered with cron.schedule, and (3) index.ts both
 * imports AND calls the sweep cron's initializer — a function that exists but is never
 * imported/called is exactly as dead as no function at all.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const podSrc = fs.readFileSync(`${root}/apps/backend/src/dispatch/pod.routes.ts`, "utf8");
  const packetSrc = fs.readFileSync(`${root}/apps/backend/src/factoring/packet-assemble.service.ts`, "utf8");
  const indexSrc = fs.readFileSync(`${root}/apps/backend/src/index.ts`, "utf8");

  if (!podSrc.includes('import { assembleFactoringPacket } from "../factoring/packet-assemble.service.js"')) {
    failures.push("pod.routes.ts must import assembleFactoringPacket from factoring/packet-assemble.service.js");
  }
  // The call must be conditioned on the review's approved outcome, not fired unconditionally.
  const reviewRouteMatch = podSrc.match(/app\.post\(\s*"\/api\/v1\/dispatch\/pod-documents\/:id\/review"[\s\S]*?\n {2}\}\);/);
  if (!reviewRouteMatch) {
    failures.push("could not locate the POD review route to check for the assembleFactoringPacket call");
  } else {
    const routeBody = reviewRouteMatch[0];
    if (!/assembleFactoringPacket\(/.test(routeBody)) {
      failures.push("the POD review route must call assembleFactoringPacket on approval");
    }
    if (!/status\s*===\s*"approved"[\s\S]{0,200}assembleFactoringPacket\(/.test(routeBody)) {
      failures.push("assembleFactoringPacket must be called conditioned on status === \"approved\", not unconditionally");
    }
  }

  const cronFnMatch = packetSrc.match(/export function initializeFactoringPacketSweepCron\s*\([\s\S]*?\n\}/);
  if (!cronFnMatch) {
    failures.push("packet-assemble.service.ts must export a cron initializer (initializeFactoringPacketSweepCron)");
  } else {
    if (!/cron\.schedule\(/.test(cronFnMatch[0])) {
      failures.push("initializeFactoringPacketSweepCron must actually register a cron.schedule(...) job");
    }
    if (!/sweepAndAssemblePackets\(/.test(cronFnMatch[0])) {
      failures.push("initializeFactoringPacketSweepCron must call the existing sweepAndAssemblePackets() — no new sweep logic");
    }
  }

  if (!indexSrc.includes('import { initializeFactoringPacketSweepCron } from "./factoring/packet-assemble.service.js"')) {
    failures.push("index.ts must import initializeFactoringPacketSweepCron from factoring/packet-assemble.service.js");
  }
  if (!/initializeFactoringPacketSweepCron\(app\)/.test(indexSrc)) {
    failures.push("index.ts must call initializeFactoringPacketSweepCron(app) at startup — imported-but-uncalled is still dead");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-factoring-packet-assemble-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodPod = `
import { assembleFactoringPacket } from "../factoring/packet-assemble.service.js";
  app.post("/api/v1/dispatch/pod-documents/:id/review", async (req, reply) => {
    if (updated.pod?.status === "approved" && updated.pod.load_id) {
      void assembleFactoringPacket({ loadId: updated.pod.load_id });
    }
    return updated;
  });
`;
  const goodPacket = `
export function initializeFactoringPacketSweepCron(app) {
  cron.schedule("30 6 * * *", async () => {
    await sweepAndAssemblePackets(SYSTEM_ACTOR_ID, company.id);
  });
}
`;
  const goodIndex = `
import { initializeFactoringPacketSweepCron } from "./factoring/packet-assemble.service.js";
initializeFactoringPacketSweepCron(app);
`;
  mk("apps/backend/src/dispatch/pod.routes.ts", goodPod);
  mk("apps/backend/src/factoring/packet-assemble.service.ts", goodPacket);
  mk("apps/backend/src/index.ts", goodIndex);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: pod.routes.ts calls it unconditionally (not gated on approved status).
  mk(
    "apps/backend/src/dispatch/pod.routes.ts",
    goodPod.replace('if (updated.pod?.status === "approved" && updated.pod.load_id) {\n      void assembleFactoringPacket({ loadId: updated.pod.load_id });\n    }', "void assembleFactoringPacket({ loadId: updated.pod.load_id });")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: unconditional call (not gated on approved) should be caught");
  mk("apps/backend/src/dispatch/pod.routes.ts", goodPod); // restore

  // Regression 2: the call is removed from pod.routes.ts entirely (back to the original bug).
  mk("apps/backend/src/dispatch/pod.routes.ts", goodPod.replace(/if \(updated\.pod[\s\S]*?\n    \}\n/, ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing assembleFactoringPacket call in pod.routes.ts should be caught");
  mk("apps/backend/src/dispatch/pod.routes.ts", goodPod); // restore

  // Regression 3: cron initializer exists but index.ts never calls it (defined-but-dead).
  mk("apps/backend/src/index.ts", goodIndex.replace("initializeFactoringPacketSweepCron(app);\n", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: imported-but-uncalled sweep cron should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-factoring-packet-assemble-wired --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-factoring-packet-assemble-wired — OK");
}
