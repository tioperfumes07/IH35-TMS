/**
 * packet-assemble.service.ts — Auto-assemble factoring packet on delivery + POD approval.
 *
 * Trigger points (wired by callers, e.g. pod.routes.ts on POD approval):
 *   - load.status transitions to 'delivered'
 *   - POD document approved with signature (dispatch.pod_documents.status = 'approved')
 *
 * What it does:
 *   1. Validates load is in a deliverable state and has an approved POD
 *   2. Stamps IH35_FACTORING_PACKAGE_V1::{generated_at} into load.notes
 *   3. Emits dispatch.factoring_packet_assembled outbox event
 *   4. Auto-creates invoice from load if none exists yet (idempotent via existing createInvoiceFromLoad route)
 *
 * What it NEVER does:
 *   - Submits to FARO (dispatcher must approve first)
 *   - Creates journal entries or touches any posting code
 *   - Modifies factoring_status (that stays on invoice, controlled by accounting routes)
 */
import { withCurrentUser } from "../auth/db.js";

const PACKET_PREFIX = "IH35_FACTORING_PACKAGE_V1::";

type PacketMeta = {
  generated_at: string | null;
  approved_at: string | null;
  emailed_at: string | null;
  uploaded_at: string | null;
  invoice_id: string | null;
};

function parsePacketMeta(notes: string | null | undefined): {
  meta: PacketMeta;
  visibleNotes: string;
} {
  const raw = String(notes ?? "");
  const empty: PacketMeta = {
    generated_at: null,
    approved_at: null,
    emailed_at: null,
    uploaded_at: null,
    invoice_id: null,
  };
  if (!raw.startsWith(PACKET_PREFIX)) return { meta: empty, visibleNotes: raw };
  const nl = raw.indexOf("\n");
  const chunk = nl >= 0 ? raw.slice(PACKET_PREFIX.length, nl) : raw.slice(PACKET_PREFIX.length);
  const rest = nl >= 0 ? raw.slice(nl + 1) : "";
  try {
    const parsed = JSON.parse(chunk) as Partial<PacketMeta>;
    return {
      meta: {
        generated_at: parsed.generated_at ?? null,
        approved_at: parsed.approved_at ?? null,
        emailed_at: parsed.emailed_at ?? null,
        uploaded_at: parsed.uploaded_at ?? null,
        invoice_id: parsed.invoice_id ?? null,
      },
      visibleNotes: rest,
    };
  } catch {
    return { meta: empty, visibleNotes: raw };
  }
}

function buildPacketNotes(meta: PacketMeta, visibleNotes: string): string {
  return `${PACKET_PREFIX}${JSON.stringify(meta)}\n${visibleNotes.trim()}`.trim();
}

export type AssemblePacketInput = {
  loadId: string;
  operatingCompanyId: string;
  userId: string;
  /** When true, assembles even if POD is not yet approved (used for manual trigger). */
  force?: boolean;
};

export type AssemblePacketResult =
  | { ok: true; already_assembled: boolean; invoice_id: string | null }
  | { ok: false; reason: string };

/**
 * Assemble the FARO factoring packet for a delivered load.
 * Idempotent — safe to call multiple times (skips if already assembled).
 */
export async function assembleFactoringPacket(
  input: AssemblePacketInput,
): Promise<AssemblePacketResult> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
      input.operatingCompanyId,
    ]);

    // ── 1. fetch load ──────────────────────────────────────────────────────
    const loadRes = await client.query<{
      id: string;
      load_number: string;
      status: string;
      notes: string | null;
      customer_id: string;
    }>(
      `
      SELECT id, load_number, status, notes, customer_id
      FROM mdata.loads
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
      `,
      [input.loadId, input.operatingCompanyId],
    );

    const load = loadRes.rows[0];
    if (!load) return { ok: false, reason: "load_not_found" };

    const eligibleStatuses = ["delivered", "invoiced", "paid", "closed"];
    if (!eligibleStatuses.includes(load.status)) {
      return { ok: false, reason: `load_status_not_deliverable:${load.status}` };
    }

    // ── 2. check if already assembled ─────────────────────────────────────
    const { meta, visibleNotes } = parsePacketMeta(load.notes);
    if (meta.generated_at) {
      return { ok: true, already_assembled: true, invoice_id: meta.invoice_id };
    }

    // ── 3. verify approved POD (unless forced) ────────────────────────────
    if (!input.force) {
      const podRes = await client.query<{ id: string }>(
        `
        SELECT id FROM dispatch.pod_documents
        WHERE load_id = $1::uuid
          AND operating_company_id = $2::uuid
          AND status = 'approved'
          AND archived_at IS NULL
        LIMIT 1
        `,
        [input.loadId, input.operatingCompanyId],
      );
      if (podRes.rows.length === 0) {
        return { ok: false, reason: "no_approved_pod" };
      }
    }

    // ── 4. find or create invoice (idempotent) ─────────────────────────────
    const invRes = await client.query<{ id: string; display_id: string }>(
      `
      SELECT id, display_id
      FROM accounting.invoices
      WHERE source_load_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status != 'void'
      LIMIT 1
      `,
      [input.loadId, input.operatingCompanyId],
    );

    let invoiceId: string | null = invRes.rows[0]?.id ?? null;

    if (!invoiceId) {
      // Auto-create invoice from load — reuses existing invoice creation SQL path
      const newInvRes = await client
        .query<{ id: string }>(
          `
          INSERT INTO accounting.invoices (
            operating_company_id,
            customer_id,
            source_load_id,
            status,
            issue_date,
            due_date,
            invoice_type,
            created_by_user_id
          )
          SELECT
            l.operating_company_id,
            l.customer_id,
            l.id,
            'draft',
            CURRENT_DATE,
            CURRENT_DATE + INTERVAL '30 days',
            'from_load',
            $3::uuid
          FROM mdata.loads l
          WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid
          ON CONFLICT (source_load_id) DO NOTHING
          RETURNING id
          `,
          [input.loadId, input.operatingCompanyId, input.userId],
        )
        .catch(() => ({ rows: [] as Array<{ id: string }> }));

      if (newInvRes.rows[0]) {
        invoiceId = newInvRes.rows[0].id;
      } else {
        // conflict: re-fetch
        const refetch = await client.query<{ id: string }>(
          `SELECT id FROM accounting.invoices WHERE source_load_id = $1::uuid AND operating_company_id = $2::uuid AND status != 'void' LIMIT 1`,
          [input.loadId, input.operatingCompanyId],
        );
        invoiceId = refetch.rows[0]?.id ?? null;
      }
    }

    // ── 5. stamp packet metadata into load.notes ───────────────────────────
    const nextMeta: PacketMeta = {
      ...meta,
      generated_at: new Date().toISOString(),
      invoice_id: invoiceId,
    };

    await client.query(
      `UPDATE mdata.loads SET notes = $1, updated_at = now() WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
      [buildPacketNotes(nextMeta, visibleNotes), input.loadId, input.operatingCompanyId],
    );

    // ── 6. emit outbox event ───────────────────────────────────────────────
    await client
      .query(
        `
        INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "mdata.loads",
          input.loadId,
          "dispatch.factoring_packet_assembled",
          JSON.stringify({
            load_id: input.loadId,
            load_number: load.load_number,
            operating_company_id: input.operatingCompanyId,
            invoice_id: invoiceId,
            assembled_at: nextMeta.generated_at,
            assembled_by_user_id: input.userId,
          }),
        ],
      )
      .catch(() => {
        // outbox emission is best-effort; packet assembly succeeds regardless
      });

    return { ok: true, already_assembled: false, invoice_id: invoiceId };
  });
}

/**
 * Batch-sweep: assemble packets for all delivered loads that:
 *   - have an approved POD
 *   - don't yet have a generated_at in notes
 *
 * Safe to run as a scheduled job or one-shot backfill.
 * Returns counts of assembled / skipped / errored.
 */
export async function sweepAndAssemblePackets(
  userId: string,
  operatingCompanyId: string,
): Promise<{ assembled: number; skipped: number; errored: number }> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
      operatingCompanyId,
    ]);

    const eligibleRes = await client.query<{ id: string; notes: string | null }>(
      `
      SELECT DISTINCT l.id, l.notes
      FROM mdata.loads l
      JOIN dispatch.pod_documents p
        ON p.load_id = l.id
        AND p.operating_company_id = l.operating_company_id
        AND p.status = 'approved'
        AND p.archived_at IS NULL
      WHERE l.operating_company_id = $1
        AND l.soft_deleted_at IS NULL
        AND l.status IN ('delivered', 'invoiced', 'paid', 'closed')
      LIMIT 500
      `,
      [operatingCompanyId],
    );

    let assembled = 0;
    let skipped = 0;
    let errored = 0;

    for (const row of eligibleRes.rows) {
      const { meta } = parsePacketMeta(row.notes);
      if (meta.generated_at) {
        skipped++;
        continue;
      }
      const result = await assembleFactoringPacket({
        loadId: row.id,
        operatingCompanyId,
        userId,
        force: false,
      });
      if (result.ok) {
        assembled++;
      } else {
        errored++;
      }
    }

    return { assembled, skipped, errored };
  });
}
