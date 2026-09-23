/**
 * SEED-SETTLEMENT-DOCUMENT ROUTE — the caller for seed-settlement-document.service.ts.
 *
 * ROUND E11.3 (owner order): "Wire it, but DO NOT RUN IT — Cursor is the sole feeder." This file
 * is the wiring; it is never invoked from this session. It is the ONLY place that opens the
 * transaction seedSettlementDocument runs inside, and the only place that calls
 * postGlForSeededDocument — always AFTER that transaction has committed, per the two-phase
 * contract documented at the top of seed-settlement-document.service.ts (postLoadRevenueLatch,
 * postFuelExpenseFromEvent, and CC-3's postLoadBookendedSettlementGlAfterClose each open their own
 * connection and would read pre-commit nothing if called from inside withCurrentUser's callback).
 *
 * The truth JSON is read HERE, server-side, by document_number — never accepted as a request body
 * blob. "Never a re-parsed PDF, never a retyped figure" extends to the transport layer too: the
 * server is the one source of truth for what a document's real figures are, not whatever a caller
 * sends.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import {
  seedSettlementDocument,
  postGlForSeededDocument,
  type TruthCompanyDoc,
  type TruthDriverDoc,
  type QueryableClient,
} from "./seed-settlement-document.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const TRUTH_JSON_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const WRITE_RL = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}
function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

const runSeedDocumentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  document_number: z.string().trim().min(1).max(20),
});

class TruthDocumentNotFoundError extends Error {
  status = 404;
  constructor(documentNumber: string) {
    super(`no company-side truth document for settlement_no=${documentNumber}`);
  }
}

let cachedTruth: { company: TruthCompanyDoc[]; driver: TruthDriverDoc[] } | null = null;
function loadTruthJson(): { company: TruthCompanyDoc[]; driver: TruthDriverDoc[] } {
  // Cached per process — the truth file is static, checked-in ground truth (never re-parsed from a
  // PDF, never edited at runtime); re-reading it on every request would be pure overhead.
  if (cachedTruth) return cachedTruth;
  const raw = fs.readFileSync(TRUTH_JSON_PATH, "utf8");
  cachedTruth = JSON.parse(raw);
  return cachedTruth as { company: TruthCompanyDoc[]; driver: TruthDriverDoc[] };
}

function findDocumentPair(documentNumber: string): { companyDoc: TruthCompanyDoc; driverDoc: TruthDriverDoc | null } {
  const truth = loadTruthJson();
  const companyDoc = truth.company.find((d) => String(d.settlement_no) === documentNumber);
  if (!companyDoc) throw new TruthDocumentNotFoundError(documentNumber);
  const driverDoc = truth.driver.find((d) => String(d.settlement_no) === documentNumber) ?? null;
  return { companyDoc, driverDoc };
}

export function registerSeedSettlementDocumentRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/feed/settlement-document/run — seed one AlwaysTrack settlement document (loads,
   * invoices, driver_bills, expenses, fuel, the settlement row) and, once that transaction has
   * committed, post its GL through the existing posters. Idempotent by document number —
   * re-running an already-seeded document is a no-op (seedSettlementDocument's own
   * findLiveSettlementByDocumentRef check), never a duplicate.
   */
  app.post("/api/v1/feed/settlement-document/run", WRITE_RL, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = runSeedDocumentBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const b = parsed.data;

    await assertCompanyMembership(user.uuid, b.operating_company_id);

    let companyDoc: TruthCompanyDoc;
    let driverDoc: TruthDriverDoc | null;
    try {
      ({ companyDoc, driverDoc } = findDocumentPair(b.document_number));
    } catch (err) {
      if (err instanceof TruthDocumentNotFoundError) {
        return reply.code(err.status).send({ error: "truth_document_not_found", document_number: b.document_number });
      }
      throw err;
    }

    // Phase 1 — every document artifact, inside one transaction. withCurrentUser COMMITs on a
    // normal return, ROLLBACKs on any throw (seedSettlementDocument's own resolver failures —
    // an unresolvable customer/driver/vendor name, a structural-A duplicate settlement — throw,
    // never guess, and roll the whole document back rather than leave a partial write).
    const seedResult = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.operating_company_id]);
      return seedSettlementDocument(client as unknown as QueryableClient, {
        operatingCompanyId: b.operating_company_id,
        actorUserId: user.uuid,
        companyDoc,
        driverDoc,
      });
    });

    if (seedResult.alreadySeeded) {
      return reply.code(200).send({ seed: seedResult, gl: null, note: "already seeded — no GL phase re-run" });
    }

    // Phase 2 — AFTER commit, own connections. See this file's own header and the service's "TWO
    // PHASES" note for why this cannot move inside the transaction above.
    const glReport = await postGlForSeededDocument(
      seedResult,
      { endDate: companyDoc.end_date },
      { operatingCompanyId: b.operating_company_id, actorUserId: user.uuid }
    );

    return reply.code(200).send({ seed: seedResult, gl: glReport });
  });
}
