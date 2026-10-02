// OWNER LAW 2026-10-02 (docs/bus 00-OWNER-LAW-2026-10-02-BUILD-ONLY-COMPETING-ENGINE-AUDIT.md) — the competing-engine
// audit. A factoring purchase / Faro funding has ONE engine: apps/backend/src/factoring/purchase.service.ts
// (createPurchaseDraft / postPurchase / voidPurchase), driven by the Owner from Factoring -> Submit to Factor.
// Money that leaves a Faro reserve account (releases, CCG payments) is a bank line on that account and posts only when it
// is matched or categorized in Banking. Every other writer of the same concern is retired at its call site: the route stays
// mounted (so an old screen or script gets a named answer, never a 404) and returns 410 naming the engine to use. The
// retired handler bodies below each call are unreachable by design. Guard: scripts/verify-one-factoring-purchase-engine.mjs.
import type { FastifyReply } from "fastify";

export const FACTORING_PURCHASE_ENGINE = "POST /api/v1/factoring/purchases (Factoring -> Submit to Factor)";
export const BANKING_MATCH_OR_CATEGORIZE = "match or categorize the bank line on the Faro reserve account in Banking";

export function sendRetiredFactoringWriter(reply: FastifyReply, writer: string, use: string = FACTORING_PURCHASE_ENGINE) {
  return reply.code(410).send({
    error: "factoring_writer_retired",
    writer,
    use,
    message: `${writer} is retired — one engine does this job: ${use}.`,
  });
}

/** Typed `boolean` (not the literal `true`) so the retired handler bodies stay type-checked rather than unreachable. */
export const LEGACY_FACTORING_WRITERS_RETIRED: boolean = true;
