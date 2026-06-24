// ARCHIVED 2026-06-24 (Tier-1 H-1, Jorge's decision: Option A — ARCHIVE).
//
// This banking manual-JE route was a DEAD path: its client `createManualJe` (apps/frontend/src/api/banking.ts)
// had ZERO callers, and the route wrote debit/credit lines into accounting.journal_entry_lines — a table the
// CI guards forbid, JE_LINE_CONTRACT_DECISION.md says should not exist, and the general ledger never reads
// (verified on Neon: the table does not exist in prod, so nothing was ever lost). The live "+ Manual JE" UI
// posts through the canonical accounting path → POST /api/v1/accounting/journal-entries → createJournalEntry()
// → accounting.journal_entry_postings (balance-enforced). That is the single canonical JE writer (QBO/NetSuite
// standard).
//
// Per ARCHIVE-never-DELETE, the route is RETIRED as an explicit tombstone (HTTP 410 Gone) rather than removed:
// the forbidden journal_entry_lines write is gone, and any caller is redirected to the canonical endpoint.
import type { FastifyInstance } from "fastify";

export async function registerBankingManualJeRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/manual-je", async (_req, reply) => {
    return reply.code(410).send({
      error: "gone",
      message:
        "The banking manual-JE endpoint is retired. Post journal entries via /api/v1/accounting/journal-entries (the canonical posting path → accounting.journal_entry_postings).",
      canonical_endpoint: "/api/v1/accounting/journal-entries",
    });
  });
}
