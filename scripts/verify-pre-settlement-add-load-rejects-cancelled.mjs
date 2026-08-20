#!/usr/bin/env node
/**
 * ACCT-F5631 — POST /pre-settlements/:id/add-load's only staleness check was trip_closed_at, which is
 * NOT a reliable "is this settlement still live" signal on its own: the governance void path
 * (governance/void-cancel-executors.ts's executeDriverSettlement) flips status='cancelled' on a
 * voided settlement but deliberately never touches trip_closed_at — the exact gap
 * settlements-load-bookended.service.ts's own ACCT-F347 comment documents and fixes for its sibling
 * queries ("a settlement that was CANCELLED while its anchor load stayed alive remained open forever:
 * cancelling does not set trip_closed_at"). Without a status check, add-load could append a fresh
 * earnings line and recompute net_pay onto a settlement the system has already reversed — a live
 * money write on a document that is supposed to be WORM once voided.
 *
 * This guard proves the add-load route rejects a cancelled settlement BEFORE it ever reaches the
 * line-append/totals-recompute code — anchored on the exact sRes SELECT->status check ordering, not
 * just "the string 'cancelled' appears somewhere in the file".
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/driver-finance/pre-settlement.routes.ts`, "utf8");

  const routeMatch = src.match(
    /app\.post\(\s*"\/api\/v1\/driver-finance\/pre-settlements\/:id\/add-load"[\s\S]*?\n {2}\}\);/
  );
  if (!routeMatch) {
    failures.push("could not locate the add-load route in pre-settlement.routes.ts");
    return failures;
  }
  const routeBody = routeMatch[0];

  if (!/settlement\.status === "cancelled"/.test(routeBody)) {
    failures.push("add-load route must check settlement.status === \"cancelled\" and refuse the write");
  }

  // The cancelled check must run BEFORE the line-append call, or a cancelled settlement could still
  // get a fresh earnings line written before the guard fires.
  const cancelledIdx = routeBody.search(/settlement\.status === "cancelled"/);
  const appendIdx = routeBody.search(/appendSettlementLineFromDriverBillIfMissing\(/);
  if (cancelledIdx === -1 || appendIdx === -1 || cancelledIdx > appendIdx) {
    failures.push(
      "the cancelled-status check must run BEFORE appendSettlementLineFromDriverBillIfMissing, or a cancelled settlement could still get money written to it"
    );
  }

  if (!/"cancelled" in result[\s\S]{0,80}reply\.code\(409\)/.test(routeBody) && !src.includes('"cancelled" in result')) {
    failures.push("the route handler must translate the cancelled guard result into a 409 response");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-pre-settlement-add-load-cancelled-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
  app.post("/api/v1/driver-finance/pre-settlements/:id/add-load", async (req, reply) => {
    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const settlement = sRes.rows[0];
      if (!settlement) return { notFound: true };
      if (settlement.status === "cancelled") return { cancelled: true };
      if (settlement.trip_closed_at) return { alreadyClosed: true };
      await appendSettlementLineFromDriverBillIfMissing(client, {});
      return { ok: true };
    });
    if (result && "cancelled" in result) return reply.code(409).send({ error: "pre_settlement_cancelled" });
    return result;
  });
`;
  mk("apps/backend/src/driver-finance/pre-settlement.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the cancelled check is removed entirely (the original bug).
  mk(
    "apps/backend/src/driver-finance/pre-settlement.routes.ts",
    good.replace('if (settlement.status === "cancelled") return { cancelled: true };\n      ', "")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing cancelled-status check should be caught");
  mk("apps/backend/src/driver-finance/pre-settlement.routes.ts", good); // restore

  // Regression 2: the check exists but runs AFTER the line-append call (ordering bug) — money is
  // already written by the time the guard fires.
  mk(
    "apps/backend/src/driver-finance/pre-settlement.routes.ts",
    good
      .replace('if (settlement.status === "cancelled") return { cancelled: true };\n      ', "")
      .replace(
        "return { ok: true };",
        'if (settlement.status === "cancelled") return { cancelled: true };\n      return { ok: true };'
      )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: cancelled check placed after the line-append should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-pre-settlement-add-load-rejects-cancelled --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-pre-settlement-add-load-rejects-cancelled — OK");
}
