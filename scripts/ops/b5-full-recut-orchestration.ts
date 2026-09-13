#!/usr/bin/env tsx
// ROUND 23.3 B5 -- the per-document orchestration that walks all 34 USMCA settlement documents and
// calls the authorized reassignment primitive (settlement-load-reassignment.service.ts) for every
// load that needs to move, so each document ends up as exactly ONE app settlement holding exactly
// its own loads and nothing else.
//
// NOT RUN AGAINST PROD BY THIS COMMIT. Owner ruling (2026-09-13, verbatim): "Rehearse on a Neon
// branch now; prod run waits until the ingest finishes -- re-cutting before CC-3's 136 expense
// lines and CC-1's invoices exist means doing it twice." This file is the rehearsed-and-ready
// orchestration; --execute against prod is deliberately withheld until that ingest lands.
//
// THE ALGORITHM (radically simpler than this file's own first draft -- see below):
// Live measurement (this session, both on a real rehearsal branch, confirmed 34/34): EVERY ONE of
// the 34 USMCA document numbers already has exactly one pre-existing, EMPTY (0 loads today),
// status='locked' driver_finance.driver_settlements row whose source_document_ref already equals
// that document's own number -- a shell settlement seeded ahead of time by an earlier process
// (matching the "split-seed-tours.ts" reference in settlement-source-document-ref.service.ts's own
// header). This file's FIRST draft did not know that and instead tried to infer a target by
// clustering which settlement each document's own loads currently sit on -- correct-looking on a
// dry run, but it created a needless SECOND, duplicate settlement for every document that already
// had its real shell waiting, discovered only by actually rehearsing and then independently
// checking for a ref match against ALL settlements, not just ones a load happened to already point
// to. Rewritten to the trivial, correct shape: for each document, find its own pre-seeded shell
// (source_document_ref = doc, status <> 'cancelled') -- exactly one is expected, and finding zero or
// more than one is a hard abort for that document, never a guess -- then move every one of that
// document's own loads into it.
//
// THE ONE SAFETY RULE THAT SURVIVES FROM THE FIRST DRAFT: a settlement with status='open' is a
// real, currently-progressing tour and must NEVER be treated as a move target OR have a load pulled
// out of it automatically -- confirmed live this session that 3 loads (13569, 13577, 13579) across
// 2 documents (5797, 5802) currently sit on a genuinely open, active tour. Those loads are reported
// as `blocked_open_tour_loads`, never silently moved, pending an explicit owner decision.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reassignLoadToSettlementInClientTx } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_SCOPE_START = "2026-08-07";
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");

export type GroundTruthDoc = { doc: string; loads: string[] };

export type LiveLoadState = {
  load_id: string;
  settlement_id: string | null;
  settlement_status: string | null;
};

export type ShellLookup = {
  // doc -> { ok: true, settlement_id } | { ok: false, reason, candidates }
  get(doc: string): { ok: true; settlement_id: string } | { ok: false; reason: string; candidate_ids: string[] };
};

export type PlannedAction = {
  doc: string;
  target_settlement_id: string | null; // null only when the shell lookup itself failed
  shell_error: string | null;
  moves: string[];
  blocked_open_tour_loads: string[];
};

export type FullRecutPlan = { actions: PlannedAction[] };

/** PURE -- no I/O. See file header: every document already has its own pre-seeded shell. */
export function planFullRecut(documents: GroundTruthDoc[], liveLoads: Map<string, LiveLoadState>, shells: ShellLookup): FullRecutPlan {
  const sorted = [...documents].sort((a, b) => Number(a.doc) - Number(b.doc));
  const actions: PlannedAction[] = [];

  for (const d of sorted) {
    const shell = shells.get(d.doc);
    let targetSettlementId: string | null = null;
    let shellError: string | null = null;
    if (shell.ok) {
      targetSettlementId = shell.settlement_id;
    } else {
      shellError = `${shell.reason} (candidates: ${shell.candidate_ids.join(",") || "none"})`;
    }
    const action: PlannedAction = {
      doc: d.doc,
      target_settlement_id: targetSettlementId,
      shell_error: shellError,
      moves: [],
      blocked_open_tour_loads: [],
    };
    if (shell.ok) {
      for (const n of d.loads) {
        const load = liveLoads.get(n);
        const current = load?.settlement_id ?? null;
        if (current && load?.settlement_status === "open" && current !== shell.settlement_id) {
          action.blocked_open_tour_loads.push(n);
          continue;
        }
        if (current !== shell.settlement_id) action.moves.push(n);
      }
    }
    actions.push(action);
  }
  return { actions };
}

function loadGroundTruthDocs(): GroundTruthDoc[] {
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const company = (raw.company ?? []).filter((r: any) => r.end_date >= USMCA_SCOPE_START);
  return company.map((r: any) => ({ doc: String(r.settlement_no), loads: r.loads ?? [] }));
}

async function loadLiveLoadState(client: pg.PoolClient, loadNumbers: string[]): Promise<Map<string, LiveLoadState>> {
  const res = await client.query(
    `SELECT l.load_number, l.id::text AS load_id, l.presettlement_link_id::text AS settlement_id, ds.status AS settlement_status
       FROM mdata.loads l
       LEFT JOIN driver_finance.driver_settlements ds ON ds.id = l.presettlement_link_id
      WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])`,
    [USMCA_COMPANY_ID, loadNumbers]
  );
  return new Map(
    res.rows.map((r: any) => [r.load_number, { load_id: r.load_id, settlement_id: r.settlement_id, settlement_status: r.settlement_status }])
  );
}

async function loadShells(client: pg.PoolClient, docs: string[]): Promise<ShellLookup> {
  const res = await client.query(
    `SELECT id::text, source_document_ref FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND source_document_ref = ANY($2::text[]) AND status <> 'cancelled'`,
    [USMCA_COMPANY_ID, docs]
  );
  const byDoc = new Map<string, string[]>();
  for (const row of res.rows as any[]) {
    const list = byDoc.get(row.source_document_ref) ?? [];
    list.push(row.id);
    byDoc.set(row.source_document_ref, list);
  }
  return {
    get(doc: string) {
      const candidates = byDoc.get(doc) ?? [];
      if (candidates.length === 1) return { ok: true as const, settlement_id: candidates[0]! };
      if (candidates.length === 0) return { ok: false as const, reason: "no pre-seeded shell settlement found", candidate_ids: [] };
      return { ok: false as const, reason: "more than one non-cancelled settlement already claims this ref", candidate_ids: candidates };
    },
  };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const executeFlag = process.argv.includes("--execute");
  if (executeFlag && !process.env.B5_RECUT_ALLOW_HOST) {
    throw new Error(
      "ABORT: --execute requires B5_RECUT_ALLOW_HOST to name the exact host you intend to run against " +
        "(a deliberate double-confirmation -- this script must never execute against an unnamed host)."
    );
  }
  if (executeFlag && !url.includes(process.env.B5_RECUT_ALLOW_HOST!)) {
    throw new Error("ABORT: DATABASE_URL does not match B5_RECUT_ALLOW_HOST -- refusing to execute.");
  }

  const documents = loadGroundTruthDocs();
  const allLoadNumbers = [...new Set(documents.flatMap((d) => d.loads))];
  const docNumbers = documents.map((d) => d.doc);

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const preClient = await pool.connect();
  let liveLoads: Map<string, LiveLoadState>;
  let shells: ShellLookup;
  try {
    await preClient.query("BEGIN");
    await preClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    liveLoads = await loadLiveLoadState(preClient, allLoadNumbers);
    shells = await loadShells(preClient, docNumbers);
    await preClient.query("COMMIT");
  } finally {
    preClient.release();
  }

  const plan = planFullRecut(documents, liveLoads, shells);
  const totalBlocked = plan.actions.reduce((s, a) => s + a.blocked_open_tour_loads.length, 0);
  const shellErrors = plan.actions.filter((a) => a.shell_error);
  console.log(
    `PLAN: ${plan.actions.length} documents -- ${totalBlocked} load(s) blocked on a live open tour ` +
      `(owner decision needed, never auto-moved), ${shellErrors.length} document(s) with a shell-lookup error.`
  );
  for (const a of plan.actions) {
    if (a.shell_error) {
      console.log(`  ${a.doc}: SHELL ERROR -- ${a.shell_error}`);
      continue;
    }
    console.log(
      `  ${a.doc}: target=${a.target_settlement_id} -- ${a.moves.length} load(s) to move: ${a.moves.join(",") || "none"}` +
        `${a.blocked_open_tour_loads.length ? ` -- BLOCKED (open tour): ${a.blocked_open_tour_loads.join(",")}` : ""}`
    );
  }

  if (!executeFlag) {
    console.log("\nDRY RUN ONLY (pass --execute with B5_RECUT_ALLOW_HOST set to actually run). No writes made.");
    await pool.end();
    return;
  }

  const results: Array<{ doc: string; ok: boolean; detail: unknown }> = [];
  for (const action of plan.actions) {
    if (action.shell_error) {
      results.push({ doc: action.doc, ok: false, detail: action.shell_error });
      continue;
    }
    if (action.moves.length === 0) {
      results.push({ doc: action.doc, ok: true, detail: "already correct, no-op" });
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      for (const loadNumber of action.moves) {
        const loadState = liveLoads.get(loadNumber)!;
        const moveResult = await reassignLoadToSettlementInClientTx(client, {
          operating_company_id: USMCA_COMPANY_ID,
          load_id: loadState.load_id,
          target_settlement_id: action.target_settlement_id!,
          actor_user_id: process.env.B5_ACTOR_USER_ID!,
          reason: `ROUND 23.3 B5 full re-cut: move into pre-seeded shell for AlwaysTrack document ${action.doc}`,
        });
        if (moveResult.kind !== "ok" && moveResult.kind !== "already_on_target") {
          throw new Error(`ABORT ${action.doc}/${loadNumber}: ${JSON.stringify(moveResult)}`);
        }
      }
      await client.query("COMMIT");
      results.push({ doc: action.doc, ok: true, detail: { target: action.target_settlement_id, moved: action.moves.length } });
    } catch (err) {
      await client.query("ROLLBACK");
      results.push({ doc: action.doc, ok: false, detail: String(err) });
    } finally {
      client.release();
    }
  }

  console.log("\nEXECUTION RESULTS:");
  for (const r of results) console.log(`  ${r.doc}: ${r.ok ? "OK" : "FAILED"} -- ${JSON.stringify(r.detail)}`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${results.length} documents FAILED -- see above. Successful documents' commits stand (per-document transactions, not one mega-transaction).`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} documents processed successfully.`);
  }

  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
