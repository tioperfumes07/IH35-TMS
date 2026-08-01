#!/usr/bin/env node
/**
 * REVREC-EVIDENCE-01 — the revenue-recognition latch must key off CAPTURED DELIVERY EVIDENCE,
 * never off load status alone; and the driver depart handler must latch only on the FINAL ACTIVE
 * delivery stop.
 *
 * WHY THIS EXISTS (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * `accounting/revrec-delivery-posting/poster.service.ts` decided Event 1 purely from
 * `resolveEvent(target_status)` — if the status said `delivered` / `delivered_pending_docs`, it
 * earned. It contained ZERO references to mdata.load_stops. Meanwhile `mdata.loads.status` is
 * written from 8 separate backend files, and THREE of them reach `delivered_pending_docs`+ by
 * validating only a status graph without ever reading a stop row:
 *   - dispatch/loads.routes.ts        (office transition — and the ONLY caller of the latch)
 *   - dispatch/loads-bulk.routes.ts   (BULK set_status; reads load_stops 0 times)
 *   - mdata/loads.routes.ts           (allowedStatusTransitions graph)
 * The exact inversion: the only path that CAPTURES delivery evidence (driver arrive/depart) never
 * triggered the latch, and the only path that DID trigger it captured no evidence. Live prod state
 * at the time: 20 stop rows, 0 with actual_arrival_at, 0 with actual_departure_at, and one load
 * sitting at `completed_docs_received` — the terminal billing status — with both stops `pending`.
 * With the flag on, that load would have earned and billed line-haul revenue with no evidence that
 * the truck ever arrived anywhere.
 *
 * SECOND DEFECT GUARDED: driver/loads.routes.ts derived the next load status as
 *   stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit"
 * which latches on ANY delivery stop. On a multi-drop load the FIRST drop would have earned the
 * ENTIRE line-haul. Latent at the time (all 10 live delivery stops were 1-per-load), which is
 * exactly why it needed a guard rather than a note.
 *
 * WHAT WOULD SILENTLY REGRESS THIS: deleting the evidence gate to "fix" a test that expects a post,
 * or reverting the depart handler to the one-line ternary during a conflict resolution. Both look
 * harmless in a diff and both restore revenue recognition with no delivery evidence.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTER = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const DRIVER = "apps/backend/src/driver/loads.routes.ts";
const LABEL = "verify-revrec-latch-is-evidence-driven";

/** Strip comments so the guard cannot be satisfied — or tripped — by prose about itself. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditPoster(src) {
  const problems = [];
  const code = stripComments(src);

  if (!/finalActiveDeliveryDepartureAt/.test(code)) {
    problems.push(
      `${POSTER} has no finalActiveDeliveryDepartureAt evidence lookup — Event 1 would earn from ` +
        `load status alone, which 3 backend paths can set without ever reading a stop row.`
    );
    return problems;
  }
  if (!/actual_departure_at/.test(code)) {
    problems.push(`${POSTER} never reads actual_departure_at — the §18 recognition source.`);
  }
  if (!/missing_delivery_evidence/.test(code)) {
    problems.push(`${POSTER} has no missing_delivery_evidence gate — the earn path cannot refuse.`);
  }
  // The gate must actually be applied to the earn event, not merely defined.
  if (!/event === "earn"[\s\S]{0,400}finalActiveDeliveryDepartureAt/.test(code)) {
    problems.push(
      `${POSTER} defines the evidence lookup but does not apply it to the earn event — a dead ` +
        `helper leaves recognition status-driven.`
    );
  }
  // Final-active semantics: last sequence, excluding cancelled and soft-deleted stops.
  for (const [needle, why] of [
    ["ORDER BY s.sequence_number DESC", "must take the LAST delivery stop, not an arbitrary one"],
    ["<> 'cancelled'", "must exclude cancelled stops"],
    ["soft_deleted_at IS NULL", "must exclude soft-deleted stops"],
  ]) {
    if (!code.includes(needle)) problems.push(`${POSTER} evidence query ${why} (missing: ${needle}).`);
  }
  return problems;
}

export function auditDriver(src) {
  const problems = [];
  const code = stripComments(src);

  // The exact pre-fix defect shape.
  if (/stop\.stop_type\s*===\s*"delivery"\s*\?\s*"delivered_pending_docs"/.test(code)) {
    problems.push(
      `${DRIVER} latches delivered_pending_docs on ANY delivery stop — on a multi-drop load the ` +
        `first drop would earn the ENTIRE line-haul. Latch on the FINAL ACTIVE delivery stop.`
    );
  }
  if (!/isFinalActiveDeliveryStop/.test(code)) {
    problems.push(
      `${DRIVER} has no isFinalActiveDeliveryStop determination — the depart handler cannot know ` +
        `whether this stop completes the load.`
    );
  }
  return problems;
}

function auditTree() {
  return [
    ...auditPoster(readFileSync(join(ROOT, POSTER), "utf8")),
    ...auditDriver(readFileSync(join(ROOT, DRIVER), "utf8")),
  ];
}

function selftest() {
  const failures = [];

  // --- poster, negative direction: the real pre-fix shape (status-driven only) ---
  const posterPreFix = `
    function resolveEvent(targetStatus) {
      if (targetStatus === "delivered" || targetStatus === "delivered_pending_docs") return "earn";
      if (targetStatus === "completed_docs_received") return "bill";
      return null;
    }
    const event = resolveEvent(input.target_status);
  `;
  if (auditPoster(posterPreFix).length === 0)
    failures.push("case1 FAIL — status-driven poster (the real pre-fix shape) was NOT caught");

  // --- poster, dead-helper direction: defined but never applied to the earn event ---
  const posterDeadHelper = `
    async function finalActiveDeliveryDepartureAt(c, o, l) {
      const r = await c.query(\`SELECT s.actual_departure_at FROM mdata.load_stops s
        WHERE s.status::text <> 'cancelled' AND s.soft_deleted_at IS NULL
        ORDER BY s.sequence_number DESC LIMIT 1\`);
      return r.rows[0] ?? null;
    }
    const reason = "missing_delivery_evidence";
    if (event === "bill") { doSomethingElse(); }
  `;
  if (auditDeadHelperCaught(posterDeadHelper) === false)
    failures.push("case2 FAIL — evidence helper defined but never applied to earn was NOT caught");

  // --- poster, positive direction: the fixed shape must be clean ---
  const posterFixed = `
    async function finalActiveDeliveryDepartureAt(c, o, l) {
      const r = await c.query(\`SELECT s.actual_departure_at::text AS actual_departure_at
        FROM mdata.load_stops s
        WHERE s.stop_type::text = 'delivery' AND s.status::text <> 'cancelled'
          AND s.soft_deleted_at IS NULL
        ORDER BY s.sequence_number DESC LIMIT 1\`);
      return r.rows[0]?.actual_departure_at ?? null;
    }
    if (event === "earn") {
      const departedAt = await finalActiveDeliveryDepartureAt(client, o, l);
      if (!departedAt) return { gate: "missing_delivery_evidence" };
    }
  `;
  if (auditPoster(posterFixed).length !== 0)
    failures.push(`case3 FAIL — fixed poster flagged: ${auditPoster(posterFixed).join(" | ")}`);

  // --- driver, negative direction: the exact pre-fix line ---
  const driverPreFix = `const nextLoadStatus = stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit";`;
  if (auditDriver(driverPreFix).length === 0)
    failures.push("case4 FAIL — the any-delivery-stop ternary was NOT caught");

  // --- driver, positive direction ---
  const driverFixed = `
    const isFinalActiveDeliveryStop = stop.stop_type === "delivery" && rows[0]?.id === stop.id;
    const nextLoadStatus = isFinalActiveDeliveryStop ? "delivered_pending_docs" : "in_transit";
  `;
  if (auditDriver(driverFixed).length !== 0)
    failures.push(`case5 FAIL — fixed driver handler flagged: ${auditDriver(driverFixed).join(" | ")}`);

  // --- the real tree must be clean (proves the fix is actually in place) ---
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case6 FAIL — real sources flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — status-driven poster caught, dead evidence-helper caught, ` +
      `any-delivery-stop ternary caught, both fixed shapes clean`
  );
}

/** case2 helper: the dead-helper fixture must be flagged specifically for not applying the gate. */
function auditDeadHelperCaught(src) {
  return auditPoster(src).some((p) => p.includes("does not apply it to the earn event"));
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — Event 1 earns only on the final active delivery stop's actual_departure_at, ` +
      `and the driver depart handler latches only on the final active delivery stop`
  );
}

main();
