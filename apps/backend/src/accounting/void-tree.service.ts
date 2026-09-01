import type { PoolClient } from "pg";

/**
 * Cascade Void — dependency-tree API (CC-1 owns this layer per
 * docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md §5: "ONE MODEL — not two. Dependency graph +
 * can_void: CC-1 GET /api/v1/linkage/void-tree. Dialog + multi-select entry points: CURSOR.").
 *
 * This is READ-ONLY (no void execution) -- it answers "if I voided this root document, what else is
 * linked, is each one MUST/MAY, and can it actually be voided right now." The dialog and the atomic
 * multi-document void transaction (design §3) are explicitly gated on the owner's APPROVED/CHANGES
 * ruling on the design doc and are NOT built here. Exposing the tree itself is safe to ship dormant --
 * nothing in the product calls it yet (same "ships OFF, wired later" shape as a feature-flagged route).
 *
 * First slice: root type "load" only, covering the design doc's own "Load" row (Proforma/Issued
 * invoice, Driver bill, Settlement lines, Expenses, Work orders, Claims). Other root types
 * (Invoice/Bill/Payment/Settlement/BankMatch/JE) are documented as REMAINING, not guessed at.
 */

export type VoidTreeRelationship = "must" | "may" | "advisory";

export type VoidTreeNode = {
  type: string;
  id: string;
  display_id: string | null;
  label: string;
  state: string;
  relationship: VoidTreeRelationship;
  can_void: boolean;
  block_reason: string | null;
};

export type VoidTree = {
  root: {
    type: "load";
    id: string;
    display_id: string | null;
    label: string;
    status: string;
  };
  nodes: VoidTreeNode[];
};

export async function getLoadVoidTree(
  client: PoolClient,
  operatingCompanyId: string,
  loadId: string
): Promise<VoidTree | null> {
  const loadRes = await client.query<{ id: string; load_number: string | null; status: string }>(
    `SELECT id::text, load_number, status FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [loadId, operatingCompanyId]
  );
  const load = loadRes.rows[0];
  if (!load) return null;

  const nodes: VoidTreeNode[] = [];

  // Load -> Invoice (design: proforma = MUST, issued = MUST, paid = block-until-unapplied,
  // factored = block-until-released).
  const invoiceRes = await client.query<{
    id: string;
    display_id: string | null;
    status: string;
    factoring_status: string | null;
  }>(
    `SELECT id::text, display_id, status, factoring_status
       FROM accounting.invoices
      WHERE source_load_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  for (const row of invoiceRes.rows) {
    let can_void = true;
    let block_reason: string | null = null;
    if (row.status === "void") {
      can_void = false;
      block_reason = "Invoice already voided.";
    } else if (row.status === "paid") {
      can_void = false;
      block_reason = "Invoice is paid — unapply the payment application(s) first.";
    } else if (row.factoring_status && row.factoring_status !== "not_factored") {
      can_void = false;
      block_reason = `Invoice is factored (${row.factoring_status}) — release the factoring assignment first.`;
    }
    nodes.push({
      type: "invoice",
      id: row.id,
      display_id: row.display_id,
      label: row.display_id ?? row.id,
      state: row.status,
      relationship: "must",
      can_void,
      block_reason,
    });
  }

  // Load -> Driver bill (MUST).
  const driverBillRes = await client.query<{ id: string; bill_number: string | null; status: string; settled_in_settlement_id: string | null }>(
    `SELECT id::text, bill_number, status, settled_in_settlement_id::text
       FROM driver_finance.driver_bills
      WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  for (const row of driverBillRes.rows) {
    const can_void = row.status !== "void";
    nodes.push({
      type: "driver_bill",
      id: row.id,
      display_id: row.bill_number,
      label: row.bill_number ?? row.id,
      state: row.status,
      relationship: "must",
      can_void,
      block_reason: can_void ? null : "Driver bill already voided.",
    });
  }

  // Load -> Settlement line (MUST — state comes from the parent settlement's lock/paid/reversed
  // status, not from the line itself; settlement_lines carries no status column of its own).
  const settlementLineRes = await client.query<{
    line_id: string;
    settlement_id: string;
    settlement_display_id: string | null;
    settlement_status: string;
    locked_at: string | null;
    paid_at: string | null;
    reversed_at: string | null;
  }>(
    `SELECT sl.id::text AS line_id, s.id::text AS settlement_id, s.display_id AS settlement_display_id,
            s.status AS settlement_status, s.locked_at::text, s.paid_at::text, s.reversed_at::text
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements s
         ON s.id = sl.settlement_id AND s.operating_company_id = sl.operating_company_id
      WHERE sl.load_id = $1::uuid AND sl.operating_company_id = $2::uuid AND sl.is_active`,
    [loadId, operatingCompanyId]
  );
  for (const row of settlementLineRes.rows) {
    let can_void = true;
    let block_reason: string | null = null;
    if (row.reversed_at) {
      can_void = false;
      block_reason = "Settlement already reversed.";
    } else if (row.paid_at) {
      can_void = false;
      block_reason = "Settlement already paid — needs a clawback path, not a silent reversal.";
    } else if (row.locked_at) {
      can_void = false;
      block_reason = "Settlement is locked — unlock it first.";
    }
    nodes.push({
      type: "settlement_line",
      id: row.line_id,
      display_id: row.settlement_display_id,
      label: row.settlement_display_id ? `${row.settlement_display_id} (line)` : row.line_id,
      state: row.settlement_status,
      relationship: "must",
      can_void,
      block_reason,
    });
  }

  // Load -> Expense (MAY — operator chooses).
  const expenseRes = await client.query<{ id: string; expense_number: string | null; status: string }>(
    `SELECT id::text, expense_number, status FROM accounting.expenses WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  for (const row of expenseRes.rows) {
    const can_void = row.status !== "void";
    nodes.push({
      type: "expense",
      id: row.id,
      display_id: row.expense_number,
      label: row.expense_number ?? row.id,
      state: row.status,
      relationship: "may",
      can_void,
      block_reason: can_void ? null : "Expense already voided.",
    });
  }

  // Load -> Work order (MAY / advisory — never auto-voided).
  const woRes = await client.query<{ id: string; display_id: string | null; status: string }>(
    `SELECT id::text, display_id, status FROM maintenance.work_orders WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  for (const row of woRes.rows) {
    nodes.push({
      type: "work_order",
      id: row.id,
      display_id: row.display_id,
      label: row.display_id ?? row.id,
      state: row.status,
      relationship: "advisory",
      can_void: false,
      block_reason: "Work orders are advisory only — review and handle manually, never auto-voided.",
    });
  }

  // Load -> Insurance claim (MAY / advisory — never auto-voided).
  const claimRes = await client.query<{ id: string; claim_number: string | null; status: string }>(
    `SELECT id::text, claim_number, status FROM insurance.claim WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`,
    [loadId, operatingCompanyId]
  );
  for (const row of claimRes.rows) {
    nodes.push({
      type: "claim",
      id: row.id,
      display_id: row.claim_number,
      label: row.claim_number ?? row.id,
      state: row.status,
      relationship: "advisory",
      can_void: false,
      block_reason: "Insurance claims are advisory only — review and handle manually, never auto-voided.",
    });
  }

  return {
    root: { type: "load", id: load.id, display_id: load.load_number, label: load.load_number ?? load.id, status: load.status },
    nodes,
  };
}
