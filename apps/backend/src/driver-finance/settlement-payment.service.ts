import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { resolveDefaultAchToken } from "./driver-payment-methods.service.js";

type PaymentState = "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid";
type PaymentEventType = "queued" | "sent" | "cleared" | "bounced" | "retried" | "marked_paid_manually";

type SettlementRow = {
  id: string;
  operating_company_id: string;
  driver_id: string | null;
  status: string;
  payment_state: PaymentState | null;
  payment_method: string | null;
  payment_bank_reference: string | null;
  payment_release_idempotency_key: string | null;
  paid_at: Date | string | null;
};

const SETTLEMENT_ROW_COLUMNS =
  "id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference, payment_release_idempotency_key, paid_at";

function settlementPaymentState(settlement: SettlementRow): PaymentState {
  return (settlement.payment_state ?? "unpaid") as PaymentState;
}

function hashPayload(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// CHAIN-07 root cause: driver_finance.driver_settlements carries FORCE ROW LEVEL SECURITY
// (policy requires operating_company_id = current_setting('app.operating_company_id')). Every
// caller below used to look the settlement up by id ALONE, BEFORE the GUC was set (the GUC was
// only learned by reading the very row RLS was blocking) -- a chicken-and-egg that made every
// settlement-payment action (queue/mark-sent/mark-cleared/mark-bounced/mark-paid-manually, and
// the auto-queue-on-finalize call) throw settlement_not_found for every settlement, every time,
// regardless of validity. Fix: callers now receive operating_company_id explicitly (from the
// route, same as every other driver_finance route) and set the GUC BEFORE this lookup, and this
// lookup scopes by BOTH id and operating_company_id (defense in depth beyond RLS alone).
//
// DOUBLE-PAY FIX (canonicalization-drop D2, restored from the deprecated payroll service L289/446/587):
// FOR UPDATE serializes concurrent mutators at the read, so a loser blocks until the winner commits
// and then observes the true post-commit state instead of racing a stale one into a doomed UPDATE.
// The load-bearing guard is the CAS predicate on every UPDATE below; this lock is defense in depth
// and protects the read-decide-append window covering appendPaymentEvent/appendCrudAudit
// (precedent: settlement-posting.service.ts).
async function loadSettlement(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  settlementId: string,
  operatingCompanyId: string,
  options: { forUpdate?: boolean } = {}
) {
  const res = await client.query<SettlementRow>(
    `
      SELECT ${SETTLEMENT_ROW_COLUMNS}
      FROM driver_finance.driver_settlements
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
      ${options.forUpdate ? "FOR UPDATE" : ""}
    `,
    [settlementId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

// DOUBLE-PAY FIX (canonicalization-drop D3/D4): every payment-state UPDATE carries a compare-and-swap
// predicate (payment_state IS NOT DISTINCT FROM the state observed under the row lock). IS NOT DISTINCT
// FROM, not "=": the column type is nullable in code (settlementPaymentState() coerces NULL -> 'unpaid');
// a plain "=" would never match a NULL row and would break the first transition of any legacy row.
// Under READ COMMITTED, a concurrency loser's UPDATE re-evaluates this WHERE after the winner commits,
// no longer matches, and affects 0 rows -- exactly one transition can win. A 0-row outcome is then a
// NORMAL concurrency rejection, not an error: resolveGuardedUpdateMiss() re-reads and splits
// already-in-target (idempotent success -- NO second event, NO second audit row, mirroring the
// deprecated latch's { idempotent: true }) from genuinely-illegal (invalid_payment_state_transition)
// and gone (settlement_not_found).
type GuardedUpdateResolution =
  | { outcome: "idempotent"; settlement: SettlementRow }
  | { outcome: "conflict" };

async function resolveGuardedUpdateMiss(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  settlementId: string,
  operatingCompanyId: string,
  targetState: PaymentState
): Promise<GuardedUpdateResolution> {
  const current = await loadSettlement(client, settlementId, operatingCompanyId);
  if (!current) throw new Error("settlement_not_found");
  if (settlementPaymentState(current) === targetState) {
    return { outcome: "idempotent", settlement: current };
  }
  return { outcome: "conflict" };
}

// One deterministic key per LOGICAL transition attempt: settlement + event type + the state the CAS
// was predicated on + the transition timestamp the winning UPDATE stamped (RETURNING). A replay of
// the same committed transition derives the same key and hits ON CONFLICT DO NOTHING (unique index
// uq_settlement_payment_events_idem_key, migration 202607630000), so a re-run writes NO second event
// row. A legal later cycle (bounced -> queued again) stamps a new timestamp and gets a new key.
function paymentEventIdempotencyKey(
  settlementId: string,
  eventType: PaymentEventType,
  previousState: PaymentState,
  transitionStamp: string | Date | null | undefined
) {
  const stamp = transitionStamp instanceof Date ? transitionStamp.toISOString() : String(transitionStamp ?? "");
  return hashPayload({ settlement_id: settlementId, event_type: eventType, previous_state: previousState, transition_stamp: stamp });
}

async function appendPaymentEvent(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  settlement: SettlementRow,
  eventType: PaymentEventType,
  userId: string,
  payload: Record<string, unknown> | null = null,
  idempotencyKey: string | null = null
) {
  await client.query(
    `
      INSERT INTO driver_finance.settlement_payment_events (
        settlement_id,
        operating_company_id,
        event_type,
        payload,
        user_id,
        idempotency_key,
        created_at
      )
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,now())
      ON CONFLICT (settlement_id, event_type, idempotency_key) WHERE idempotency_key IS NOT NULL
      DO NOTHING
    `,
    [settlement.id, settlement.operating_company_id, eventType, JSON.stringify(payload ?? {}), userId, idempotencyKey]
  );
}

async function ownerEmailsForCompany(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ email: string }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM identity.users u
        JOIN org.user_company_access uca ON uca.user_id = u.id
        WHERE u.role = 'Owner'
          AND u.deactivated_at IS NULL
          AND u.email IS NOT NULL
          AND uca.company_id = $1
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => row.email).filter(Boolean);
  });
}

// A driver is "bank configured" for ACH when they have an active default ACH method with a token in the
// canonical store (driver_finance.driver_payment_methods). This replaces a probe against mdata.drivers
// direct-deposit token columns that never existed (so ACH could never be queued). Flag-gated
// (DRIVER_PAYMENT_METHODS_ENABLED, per-entity default OFF) and expand/contract-safe (resolveDefaultAchToken
// no-ops if the flag is OFF or the HELD table isn't migrated), so default behavior is unchanged until the
// owner flips the flag per entity.
async function hasDriverBankToken(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  driverId: string | null,
  operatingCompanyId: string
) {
  if (!driverId) return false;
  const token = await resolveDefaultAchToken(client, operatingCompanyId, driverId);
  return token != null;
}

function validateTransition(current: PaymentState, next: PaymentState) {
  const allowed: Record<PaymentState, PaymentState[]> = {
    unpaid: ["queued", "manual_paid"],
    queued: ["sent_to_bank", "manual_paid", "bounced"],
    sent_to_bank: ["cleared", "bounced"],
    cleared: [],
    bounced: ["queued", "manual_paid"],
    manual_paid: [],
  };
  return allowed[current].includes(next);
}

export async function queuePayment(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    // GUC must be set BEFORE the lookup -- driver_settlements is FORCE RLS (see loadSettlement).
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId, { forUpdate: true });
    if (!settlement) throw new Error("settlement_not_found");

    const currentState = settlementPaymentState(settlement);
    if (currentState === "queued") return settlement; // idempotent: double-click/retry, no second event/audit
    if (!(settlement.status === "locked" || settlement.status === "final")) {
      throw new Error("settlement_must_be_final");
    }
    if (!validateTransition(currentState, "queued")) {
      throw new Error("invalid_payment_state_transition");
    }

    const bankConfigured = await hasDriverBankToken(client, settlement.driver_id, operatingCompanyId);
    if (!bankConfigured && (settlement.payment_method ?? "") !== "check") {
      throw new Error("driver_bank_configuration_required");
    }

    // Each queue is one payment-release attempt: mint a fresh rail-boundary idempotency key here
    // (re-queue after bounce = a NEW release, so the old key must not be reused for it), which
    // markSentToBank then carries to the bank unchanged on every retry of THIS release.
    const releaseKey = crypto.randomUUID();
    const updateRes = await client.query<SettlementRow & { payment_queued_at: Date | string | null }>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'queued',
            payment_queued_at = now(),
            payment_release_idempotency_key = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND payment_state IS NOT DISTINCT FROM $3
        RETURNING ${SETTLEMENT_ROW_COLUMNS}, payment_queued_at
      `,
      [settlement.id, settlement.operating_company_id, settlement.payment_state, releaseKey]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      const miss = await resolveGuardedUpdateMiss(client, settlement.id, operatingCompanyId, "queued");
      if (miss.outcome === "idempotent") return miss.settlement;
      throw new Error("invalid_payment_state_transition");
    }

    await appendPaymentEvent(
      client,
      updated,
      "queued",
      userId,
      { previous_state: currentState, release_idempotency_key: releaseKey },
      paymentEventIdempotencyKey(updated.id, "queued", currentState, updated.payment_queued_at)
    );
    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_queued",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markSentToBank(settlementId: string, operatingCompanyId: string, bankReference: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId, { forUpdate: true });
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (currentState === "sent_to_bank") return settlement; // idempotent: instruction already recorded
    if (!validateTransition(currentState, "sent_to_bank")) {
      throw new Error("invalid_payment_state_transition");
    }

    // Rail boundary: reuse the release key minted at queue time so a retry-after-partial-failure
    // presents the SAME idempotency key to the bank (one instruction per release). COALESCE covers
    // rows queued before the key existed: mint one now, exactly once.
    const fallbackReleaseKey = crypto.randomUUID();
    const updateRes = await client.query<SettlementRow & { payment_sent_at: Date | string | null }>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'sent_to_bank',
            payment_sent_at = now(),
            payment_bank_reference = $3,
            payment_release_idempotency_key = COALESCE(payment_release_idempotency_key, $5),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND payment_state IS NOT DISTINCT FROM $4
        RETURNING ${SETTLEMENT_ROW_COLUMNS}, payment_sent_at
      `,
      [settlement.id, settlement.operating_company_id, bankReference, settlement.payment_state, fallbackReleaseKey]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      const miss = await resolveGuardedUpdateMiss(client, settlement.id, operatingCompanyId, "sent_to_bank");
      if (miss.outcome === "idempotent") return miss.settlement;
      throw new Error("invalid_payment_state_transition");
    }
    await appendPaymentEvent(
      client,
      updated,
      "sent",
      userId,
      { bank_reference: bankReference, release_idempotency_key: updated.payment_release_idempotency_key },
      paymentEventIdempotencyKey(updated.id, "sent", currentState, updated.payment_sent_at)
    );
    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_sent",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        bank_reference: bankReference,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markCleared(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId, { forUpdate: true });
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (currentState === "cleared") return settlement; // idempotent: terminal state already reached
    if (!validateTransition(currentState, "cleared")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow & { payment_cleared_at: Date | string | null }>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'cleared',
            payment_cleared_at = now(),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND payment_state IS NOT DISTINCT FROM $3
        RETURNING ${SETTLEMENT_ROW_COLUMNS}, payment_cleared_at
      `,
      [settlement.id, settlement.operating_company_id, settlement.payment_state]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      const miss = await resolveGuardedUpdateMiss(client, settlement.id, operatingCompanyId, "cleared");
      if (miss.outcome === "idempotent") return miss.settlement;
      throw new Error("invalid_payment_state_transition");
    }
    await appendPaymentEvent(
      client,
      updated,
      "cleared",
      userId,
      {},
      paymentEventIdempotencyKey(updated.id, "cleared", currentState, updated.payment_cleared_at)
    );

    const payloadHash = hashPayload({
      settlement_id: updated.id,
      payment_state: updated.payment_state,
      payment_bank_reference: updated.payment_bank_reference,
    });
    await enqueueSyncJob(updated.operating_company_id, "settlement", updated.id, payloadHash, userId);

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_cleared",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function markBounced(settlementId: string, operatingCompanyId: string, reason: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId, { forUpdate: true });
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    if (currentState === "bounced") return settlement; // idempotent: bounce already recorded
    if (!validateTransition(currentState, "bounced")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow & { updated_at: Date | string | null }>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'bounced',
            payment_bounced_reason = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND payment_state IS NOT DISTINCT FROM $4
        RETURNING ${SETTLEMENT_ROW_COLUMNS}, updated_at
      `,
      [settlement.id, settlement.operating_company_id, reason, settlement.payment_state]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      const miss = await resolveGuardedUpdateMiss(client, settlement.id, operatingCompanyId, "bounced");
      if (miss.outcome === "idempotent") return miss.settlement;
      throw new Error("invalid_payment_state_transition");
    }
    await appendPaymentEvent(
      client,
      updated,
      "bounced",
      userId,
      { reason },
      paymentEventIdempotencyKey(updated.id, "bounced", currentState, updated.updated_at)
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.payment_bounced",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        reason,
      },
      "warning",
      "P5-T5-SETTLEMENT-PAYMENT"
    );

    const ownerEmails = await ownerEmailsForCompany(updated.operating_company_id);
    if (ownerEmails.length > 0) {
      await sendEmail({
        to: ownerEmails,
        subject: `[IH 35 TMS] Settlement payment bounced (${updated.id})`,
        sender: "noreply",
        html: `<p>Settlement payment bounced.</p><p>Settlement: ${updated.id}</p><p>Reason: ${reason}</p>`,
        text: `Settlement payment bounced. Settlement: ${updated.id}. Reason: ${reason}.`,
        eventClass: "driver_pay.settlement.payment_bounced",
        actorUserId: userId,
      }).catch(() => undefined);
    }

    return updated;
  });
}

export async function markPaidManually(
  settlementId: string,
  operatingCompanyId: string,
  paymentMethod: string,
  reference: string | null,
  userId: string
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId, { forUpdate: true });
    if (!settlement) throw new Error("settlement_not_found");
    const currentState = settlementPaymentState(settlement);
    // Idempotent for state — but heal paid_at when Mark Paid previously left it NULL (S-0085 class).
    if (currentState === "manual_paid") {
      if (settlement.paid_at == null) {
        const heal = await client.query<SettlementRow>(
          `
            UPDATE driver_finance.driver_settlements
            SET paid_at = now(),
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2
              AND payment_state = 'manual_paid'
              AND paid_at IS NULL
            RETURNING ${SETTLEMENT_ROW_COLUMNS}
          `,
          [settlement.id, settlement.operating_company_id]
        );
        if (heal.rows[0]) return heal.rows[0];
      }
      return settlement; // idempotent: disbursement already recorded ONCE
    }
    if (!validateTransition(currentState, "manual_paid")) {
      throw new Error("invalid_payment_state_transition");
    }

    const updateRes = await client.query<SettlementRow & { updated_at: Date | string | null }>(
      `
        UPDATE driver_finance.driver_settlements
        SET payment_state = 'manual_paid',
            payment_method = $3,
            payment_bank_reference = $4,
            paid_at = COALESCE(paid_at, now()),
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
          AND payment_state IS NOT DISTINCT FROM $5
        RETURNING ${SETTLEMENT_ROW_COLUMNS}, updated_at
      `,
      [settlement.id, settlement.operating_company_id, paymentMethod, reference, settlement.payment_state]
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      const miss = await resolveGuardedUpdateMiss(client, settlement.id, operatingCompanyId, "manual_paid");
      if (miss.outcome === "idempotent") return miss.settlement;
      throw new Error("invalid_payment_state_transition");
    }
    await appendPaymentEvent(
      client,
      updated,
      "marked_paid_manually",
      userId,
      { payment_method: paymentMethod, reference },
      paymentEventIdempotencyKey(updated.id, "marked_paid_manually", currentState, updated.updated_at)
    );

    await appendCrudAudit(
      client,
      userId,
      "driver_pay.settlement.marked_paid_manually",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlement.id,
        operating_company_id: settlement.operating_company_id,
        payment_method: paymentMethod,
        reference,
      },
      "info",
      "P5-T5-SETTLEMENT-PAYMENT"
    );
    return updated;
  });
}

export async function queuePaymentOnFinalize(settlementId: string, operatingCompanyId: string, userId: string) {
  // NOTE: this used to `return withCurrentUser(...)` as its first statement, which made the
  // `try { await queuePayment(...) }` block below permanently unreachable dead code -- the
  // auto-queue-on-finalize feature never actually queued a payment even when a company had
  // auto_queue_settlement_payments=true. Fixed: await the enabled-check, THEN conditionally call
  // queuePayment in its own transaction (queuePayment opens its own withCurrentUser scope).
  const enabled = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const settlement = await loadSettlement(client, settlementId, operatingCompanyId);
    if (!settlement) throw new Error("settlement_not_found");
    const companyRes = await client.query<{ auto_queue_settlement_payments: boolean }>(
      `SELECT auto_queue_settlement_payments FROM org.companies WHERE id = $1 LIMIT 1`,
      [operatingCompanyId]
    );
    return Boolean(companyRes.rows[0]?.auto_queue_settlement_payments);
  });
  if (!enabled) return { queued: false, reason: "auto_queue_disabled" as const };

  try {
    await queuePayment(settlementId, operatingCompanyId, userId);
    return { queued: true as const };
  } catch (error) {
    return { queued: false as const, reason: String((error as Error)?.message ?? "queue_payment_failed") };
  }
}

export async function listPaymentEvents(settlementId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        SELECT id, settlement_id, operating_company_id, event_type, payload, user_id, created_at
        FROM driver_finance.settlement_payment_events
        WHERE settlement_id = $1
          AND operating_company_id = $2
        ORDER BY created_at ASC
      `,
      [settlementId, operatingCompanyId]
    );
    return res.rows;
  });
}

