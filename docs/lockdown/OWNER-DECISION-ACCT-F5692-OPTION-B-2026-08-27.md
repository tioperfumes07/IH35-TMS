# OWNER DECISION — ACCT-F5692 OPTION B (locked 2026-08-27 23:00 CT)

**Answered = closed. Do not re-ask A/B/C. Do not implement A or C.**

Owner typed **B** in chat (2026-08-27). Cursor records it here so no seat waits on Jorge again.

## The decision

**A/R posts on delivery evidence + invoice issuance.**

POD is **not** a condition of Event 2 (`buildBillEvent2Postings`). POD remains required for **factoring submission** (`factoring/submission-queue.service.ts` `has_approved_pod` — already). Matches QBO / NetSuite / McLeod: the bill/invoice creates the receivable; POD gates collection/factoring.

## Why the live scenarios did not move the books

Seats walked TRANSP, then USMCA: Book Load, deliver, invoice, chrome. Those hops wrote **loads and invoices**. Event 2 did **not** book A/R because ACCT-F5692 (`hasApprovedPodEvidence`) requires an **approved** `dispatch.pod_documents` row, and prod has **0** POD rows. The invoice poster stands down (`InvoiceRevrecLatchOwnsLoadError`). Chrome-green + scenario-green ≠ receivable. That is why the walks felt wasted: they measured the wrong layer.

TRANSP walks are **out of scope** for launch (USMCA-only). They were not a USMCA ledger proof.

## CC-1 implements B (money serial — reuse poster, no new A/R poster)

1. **Remove** the Event 2 call to `hasApprovedPodEvidence()` in `poster.service.ts`. Do **not** delete the factoring POD predicate.
2. Event 2 posts only when **all** hold: earn latch exists · non-void invoice for that load is **issued** (`sent` / `partial` / `paid`, not draft-only) · amount > 0. Gate string if invoice missing: `missing_issued_invoice` (not `missing_pod_evidence`).
3. Fire Event 2 from **invoice send** (after-commit), not only from `completed_docs_received`. Delivery still fires Event 1. Invoice issuance fires Event 2 if earn exists.
4. Re-fire Event 2 for existing **USMCA** invoiced loads that have earn + issued invoice and **no** active bill latch (INV-37/38/44/45 class). Do **not** void those invoices. Do **not** invent a second poster.
5. Invert tests: `poster-pod-evidence-gate.test.ts` + `revrec-latch-two-event-live.db.test.ts` — Event 2 **POSTS without POD**; Event 2 **REFUSES without issued invoice**; factoring **still REFUSES without approved POD**.
6. Then the still-open money items: void **must reverse** Event-2 A/R ($9,995.50 INV-00006/00019/00023) · unapplied **must not CR 1100** ($1,700 PMT-00006/00007 USMCA) · 17 role dupes + `UNIQUE (opco, role)` · stale F59 comment (JE `aaad9534`).

**Forbidden:** bisect 08-10→08-11 · new invoice A/R poster · void INV-37/38/44/45 · activate duplicate-role twins · recertify U14 · `trigger_deploy`.

Companion: `docs/lockdown/STOP-CC1-ACCT-F5692-POD-GATE-2026-08-28.md` (history). GO: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-2300.md`.
