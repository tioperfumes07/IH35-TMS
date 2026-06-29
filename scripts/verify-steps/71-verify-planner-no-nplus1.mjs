import fs from "node:fs";
import path from "node:path";

// DB-7 Phase 1 guard — the dispatch planner must NOT reintroduce the per-driver N+1.
// getPlannerWeek used to loop driversRes.rows calling getCurrentClocks + listDriverBlackouts once
// per driver (2×N serial queries → ~8.7s). It now uses the batched helpers (2 queries total). This
// guard fails if a per-driver call to either single-driver fn reappears inside a loop, or if the
// batched helpers are dropped.
export default {
  name: "verify-planner-no-nplus1",
  run: async () => {
    const src = fs.readFileSync(
      path.resolve("apps/backend/src/dispatch/planner.service.ts"),
      "utf8"
    );
    const fails = [];

    // The batched helpers must be wired into getPlannerWeek.
    if (!src.includes("getCurrentClocksForDrivers(")) {
      fails.push("getPlannerWeek must use getCurrentClocksForDrivers (batched HOS status), not per-driver getCurrentClocks.");
    }
    if (!src.includes("listDriverBlackoutsForDrivers(")) {
      fails.push("getPlannerWeek must use listDriverBlackoutsForDrivers (batched blackouts), not a per-driver query.");
    }

    // No per-driver clock/blackout call inside a for/forEach/map over driver rows.
    const loopBody = src.match(/for\s*\(const\s+\w+\s+of\s+driversRes\.rows\)[\s\S]*?\n\s{4}\}/);
    if (loopBody && /getCurrentClocks\(|listDriverBlackouts\(/.test(loopBody[0])) {
      fails.push("per-driver getCurrentClocks/listDriverBlackouts call inside a driversRes.rows loop — that is the N+1.");
    }
    // The single-driver per-row blackout helper must be gone (replaced by the batched one).
    if (/async function listDriverBlackouts\b(?!ForDrivers)/.test(src)) {
      fails.push("single-driver listDriverBlackouts still defined — should be replaced by listDriverBlackoutsForDrivers.");
    }

    if (fails.length) {
      console.error("verify-planner-no-nplus1 FAILED:");
      for (const f of fails) console.error("  " + f);
      process.exit(1);
    }
    console.log("verify-planner-no-nplus1 OK — planner uses batched HOS/blackout queries (no per-driver N+1).");
  },
};
