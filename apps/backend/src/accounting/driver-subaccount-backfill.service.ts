// DRIVER-SUBACCOUNT-BULK-BACKFILL — for existing drivers, report (dry-run) or create (apply, gated)
// the per-driver asset + escrow sub-accounts, reusing the EXACT idempotent resolve/skip logic and the
// EXACT provisioners from the per-hire path (#933 asset / #934 escrow) — no duplicated logic, no UUID
// hardcoding. DEFAULT MODE = DRY-RUN (zero writes). The real write run requires explicit apply=true.

import {
  planDriverSubAccount,
  driverAdvanceSubAccountName,
  driverEscrowSubAccountName,
  provisionDriverAdvanceSubAccount,
  provisionDriverEscrowSubAccount,
  DRIVER_ADVANCE_PARENT_NAME,
  DRIVER_ESCROW_PARENT_NAME,
  type SubAccountPlan,
} from "./driver-subaccount-provision.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type BackfillDriver = { driverId: string; driverName: string };
export type SubAccountDecision = "CREATE" | "SKIP-exists" | "SKIP-no-parent";
export type BackfillRow = {
  driver_id: string;
  driver_name: string;
  asset_subaccount: SubAccountDecision;
  escrow_subaccount: SubAccountDecision;
};
export type BackfillReport = {
  mode: "dry-run" | "apply";
  operating_company_id: string;
  totals: {
    drivers_scanned: number;
    asset_to_create: number;
    escrow_to_create: number;
    already_existing: number;
    no_parent: number;
  };
  rows: BackfillRow[];
};

function decisionOf(action: SubAccountPlan["action"]): SubAccountDecision {
  return action === "create" ? "CREATE" : action === "skip_exists" ? "SKIP-exists" : "SKIP-no-parent";
}

async function loadDriverRoster(client: DbClient, operatingCompanyId: string): Promise<BackfillDriver[]> {
  const r = await client.query<{ id: string; first_name: string | null; last_name: string | null }>(
    `
      SELECT id::text, first_name, last_name
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
      ORDER BY created_at ASC, id ASC
    `,
    [operatingCompanyId]
  );
  return r.rows.map((d) => ({ driverId: d.id, driverName: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() }));
}

/**
 * Bulk backfill the per-driver sub-accounts for an operating company.
 * DEFAULT = DRY-RUN (apply !== true): NO writes — only plan SELECTs — produces the CREATE/SKIP report.
 * apply === true performs the writes via the SAME idempotent provisioners (Jorge's explicit go only).
 */
export async function runDriverSubAccountBackfill(
  client: DbClient,
  input: { operatingCompanyId: string; apply?: boolean; drivers?: BackfillDriver[]; actorUserId?: string }
): Promise<BackfillReport> {
  const apply = input.apply === true; // DEFAULT OFF — explicit `true` required for any write.
  // AF-1 entity scope: catalogs.accounts is per-entity. Set the GUC so the plan reads + provision writes
  // resolve/land inside THIS entity's chart only (otherwise RLS returns 0 rows, or under bypass a driver's
  // sub-accounts would nest under another entity's parent — a cross-entity GL leak).
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
  const drivers = input.drivers ?? (await loadDriverRoster(client, input.operatingCompanyId));

  const rows: BackfillRow[] = [];
  const totals = { drivers_scanned: 0, asset_to_create: 0, escrow_to_create: 0, already_existing: 0, no_parent: 0 };

  for (const d of drivers) {
    totals.drivers_scanned += 1;

    const assetPlan = await planDriverSubAccount(client, {
      parentName: DRIVER_ADVANCE_PARENT_NAME,
      parentType: "Asset",
      subAccountName: driverAdvanceSubAccountName(d.driverName),
      operatingCompanyId: input.operatingCompanyId,
    });
    const escrowPlan = await planDriverSubAccount(client, {
      parentName: DRIVER_ESCROW_PARENT_NAME,
      parentType: "Liability",
      subAccountName: driverEscrowSubAccountName(d.driverName),
      operatingCompanyId: input.operatingCompanyId,
    });

    if (assetPlan.action === "create") totals.asset_to_create += 1;
    if (escrowPlan.action === "create") totals.escrow_to_create += 1;
    if (assetPlan.action === "skip_exists") totals.already_existing += 1;
    if (escrowPlan.action === "skip_exists") totals.already_existing += 1;
    if (assetPlan.action === "skip_no_parent" || escrowPlan.action === "skip_no_parent") totals.no_parent += 1;

    // GATED WRITE — only when explicitly apply=true (defaults OFF). Reuses the exact provisioners.
    if (apply && input.actorUserId) {
      const provArgs = { operatingCompanyId: input.operatingCompanyId, driverId: d.driverId, driverName: d.driverName, actorUserId: input.actorUserId };
      if (assetPlan.action === "create") await provisionDriverAdvanceSubAccount(client, provArgs);
      if (escrowPlan.action === "create") await provisionDriverEscrowSubAccount(client, provArgs);
    }

    rows.push({
      driver_id: d.driverId,
      driver_name: d.driverName,
      asset_subaccount: decisionOf(assetPlan.action),
      escrow_subaccount: decisionOf(escrowPlan.action),
    });
  }

  return { mode: apply ? "apply" : "dry-run", operating_company_id: input.operatingCompanyId, totals, rows };
}

/**
 * Excel/CSV roster parser for the later Jorge-provided spreadsheet. Columns: a driver-name column and
 * an optional id column. Accepted now; the CSV-driven run is exercised later with the real file.
 */
export function parseDriverRosterCsv(text: string): BackfillDriver[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => h.includes("name"));
  const idIdx = headers.findIndex((h) => h === "id" || h.includes("driver_id") || h.includes("driver id"));
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        driverId: idIdx >= 0 ? cols[idIdx] ?? "" : "",
        driverName: nameIdx >= 0 ? cols[nameIdx] ?? "" : cols[0] ?? "",
      };
    })
    .filter((d) => d.driverName);
}
