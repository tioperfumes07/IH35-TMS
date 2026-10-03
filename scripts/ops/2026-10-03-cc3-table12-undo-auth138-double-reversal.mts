#!/usr/bin/env -S npx tsx
// KILL THE SECOND SYSTEM table 12 (CC-3) — measuring accounting.vendor_balances against A/P control found A/P carrying
// 2,976.63 that NO vendor owes. Cause, verified link by link on prod (2026-10-03, bypass_rls, read-only):
//   (1) 60 expense postings  Dr 9000 Ask My Accountant / Cr 2000 A/P  (the expenses were later voided, now purged);
//   (2) 2026-09-25 a bulk action posted their REVERSALS  Dr 2000 / Cr 9000 — each original carries reversed_by_je_id = (2);
//   (3) 2026-09-30 AUTH-138 (#23194, ops-defect3-reverse-orphaned-9000-ap-plug.mts) read (2) as "orphaned plugs" and
//       reversed THEM — Dr 9000 / Cr 2000, memo "Reversal of journal entry <id>", source type journal_entry, no vendor.
//   (3) re-instated the A/P of 60 voided expenses. A/P 2000 nets 3,542.98 credit; the vendor subledger (vendor_balances,
//   = the open bills) is 566.35 and ties the GL vendor by vendor; the difference is exactly these 60 entries.
// FIX: reverse each (3) through reverseJournalEntryNoFlip — the same sanctioned, linked primitive AUTH-138 used. Net
// effect per chain: (1)+(2)+(3)+(4) = 0, the state the voided expense requires. No new account, no plug, no hand JE.
// REFUSES unless: exactly these 60, each still live and unreversed, each reverses a 09-25 entry that reverses an
// expense posting Dr 9000 / Cr 2000, total 297,663 cents. REFUSES TO COMMIT unless afterwards A/P 2000 net ==
// sum(vendor_balances.balance_cents) for USMCA and no A/P posting is left without a vendor.
// Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";

const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // primary owner / system actor — the actor of (2) and (3)
const AP = "34d5f1f7-385f-450c-b324-927fff09d31f"; // USMCA 2000 Accounts Payable (A/P), the bound ap_control
const TOTAL_CENTS = 297663;
const REASON =
  "KILL THE SECOND SYSTEM table 12 (CC-3): AUTH-138 reversed the 2026-09-25 reversals of 60 voided-expense postings, " +
  "re-instating A/P no vendor owes. This reverses that reversal so each voided expense nets to zero. No plug, no new account.";
const IDS = [
  "02135c5c-ad7d-4eb0-ac43-9059eb0d05be", "054b12e1-23b5-47ac-a613-8569760fdeab",
  "19656da7-cf96-4653-9981-82d5a23392d7", "1b7e045c-029f-4d75-a6c9-65dc3ee5d29a",
  "22bee89b-1334-460b-a4a2-08bca37c2231", "24d6bbd4-e070-4c81-9906-998395fb03c1",
  "26fb4fd7-d1f3-4482-9fd6-526bfb81511f", "2d4fd9ff-3a9a-4fe9-8cca-62cb256ed10d",
  "30aef690-9165-4a29-a4e8-ca745d7d9e28", "3d472835-cdc4-4685-9b1a-416b9db479ad",
  "3e65c048-8d74-47be-b5ae-114d31bc6c4c", "3fcbda90-9ce4-4c7c-a890-220abd8386af",
  "42503538-80eb-4d70-8ee8-8a6baff600ef", "444804e9-cf76-449d-a546-95a9be4cd82b",
  "4c0fcc5c-a3dd-49b1-bcd8-a9b80bc2513f", "4c5f848a-fc32-417f-88e3-2982d804edc6",
  "558d362d-9773-457e-bd6f-a2d06c2f808a", "69d45097-590c-4264-9324-51299b584261",
  "6b2ab61f-9281-4847-a6db-739da1d6a24b", "6c4fbd93-3189-4c3d-b8c5-da1ccdc3b0b1",
  "72ed1ddc-a34e-4d1b-b827-9ce5319461aa", "74b5d8ab-8feb-4d1e-b485-7c140c4f282d",
  "7d24158b-f29f-445c-89b9-8d0ef0547496", "800a55d0-bf7e-4174-968e-586fd1720cdc",
  "819c3769-a53e-4368-8683-d7831f410254", "8789b536-b6ee-460f-8d18-7258a7a820be",
  "9176e3c9-6961-4dd6-b81b-769304018727", "93541b96-9d73-4f30-81f1-66e5265e9266",
  "96606653-d17c-4008-a86d-ffef9199abed", "9882c496-afee-4fc8-8e24-cc69d73267e1",
  "99790c7f-2637-4302-86cf-a887e81e7754", "9b600460-acd1-40f0-b587-a1c50fc4ab9d",
  "9b72e2f1-6e87-4056-a76d-bedd44d4aedd", "a41183ce-b266-46a1-81d0-436358a16660",
  "a416a65f-ab7d-4f5f-982e-4a50cf8016f2", "a5b7188e-d776-4906-ae7c-7b8958ff69e4",
  "a91e82c6-e907-461e-8bcb-239c0606d8b2", "ad50832d-a837-4a37-99d0-c2bdd3c7c564",
  "ae4de3a1-faef-4743-aeff-f63f960ae84d", "b183729f-3d7d-4b7a-8657-fbbc9e144a3d",
  "b1a2b760-5f59-4c8e-88f0-04e039c31974", "c18f63d2-e5b2-4a95-a846-a8b4c1d263a5",
  "c2d918d6-b4b7-4c05-9f61-3baa68659fd3", "c3d561ba-8fa0-4dc6-92f5-6230b1ac104c",
  "c725b4c4-b2c5-45f6-b4dc-1319988fccab", "d0ef4066-653c-40cb-82e8-a3d62101ab65",
  "d8dfa4d1-af6c-415d-9299-d76801e376e1", "d90fa2ea-1e53-409f-a99e-71a0986c680d",
  "e44edd4f-8445-4679-9348-ecdd024bab60", "e6bca270-ed2e-4fd6-ad67-76d47079bb0b",
  "e8c92b4b-8fca-4edd-a680-7ef2f2534dec", "e8ec1a26-4f7a-427d-a6c5-65bd1ed0e5a6",
  "ed5040db-bc08-4d23-950d-5ceb2de3d69c", "f2f35978-2ff8-45cd-b3e1-9e59d0fa07ea",
  "f6225d55-d8c0-4dab-b4e7-38a4811cd31d", "f6c8efa8-1f20-49b3-b5a0-46666fc9572c",
  "fbf671e2-10b4-469b-998a-997a07c3ff15", "fd93fa5c-a5f9-482e-9edd-2b147d997659",
  "fec6c033-fa7b-41da-a697-327bbe46ae6d", "fedcf228-d977-43c0-8015-99d4171f3f20",
];

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("table12_undo_auth138_double_reversal", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  if (IDS.length !== 60) throw new Error(`expected 60 ids, got ${IDS.length}`);

  const chains = await q(
    `SELECT j3.id::text id, j3.status, j3.voided_at IS NULL live, j3.reversed_by_je_id IS NULL unreversed,
            p3.amount_cents::bigint cents, p3.debit_or_credit dc,
            j2.reversed_by_je_id::text j2_rev_by, j2.reverses_je_id::text j1,
            j1.reversed_by_je_id::text j1_rev_by,
            (SELECT string_agg(a.account_number || ':' || op.debit_or_credit || ':' || op.source_transaction_type, ',' ORDER BY a.account_number)
               FROM accounting.journal_entry_postings op JOIN catalogs.accounts a ON a.id = op.account_id WHERE op.journal_entry_uuid = j1.id) j1_legs
       FROM accounting.journal_entries j3
       JOIN accounting.journal_entry_postings p3 ON p3.journal_entry_uuid = j3.id AND p3.account_id = $2::uuid
       JOIN accounting.journal_entries j2 ON j2.id = j3.reverses_je_id
       JOIN accounting.journal_entries j1 ON j1.id = j2.reverses_je_id
      WHERE j3.id = ANY($1::uuid[]) AND j3.operating_company_id = $3::uuid
      FOR UPDATE OF j3`,
    [IDS, AP, USMCA]
  );
  const bad = chains.filter((r: any) =>
    r.status !== "posted" || !r.live || !r.unreversed || r.dc !== "credit" ||
    r.j2_rev_by !== r.id || r.j1_rev_by === null || r.j1_legs !== "2000:credit:expense,9000:debit:expense");
  const total = chains.reduce((s: number, r: any) => s + Number(r.cents), 0);
  if (chains.length !== 60 || bad.length || total !== TOTAL_CENTS)
    throw new Error(`REFUSE: chain state changed — ${JSON.stringify({ found: chains.length, total, bad: bad.slice(0, 3) })}`);

  const net = async () => (await q(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::bigint n
       FROM accounting.journal_entry_postings WHERE account_id = $1::uuid`, [AP]))[0].n;
  const before = Number(await net());

  const reversals: string[] = [];
  for (const id of IDS) {
    const r = await reverseJournalEntryNoFlip(c, { operatingCompanyId: USMCA, journalEntryId: id, reason: REASON, actorUserId: ACTOR });
    reversals.push(r.reversal?.reversal_journal_entry_id ?? "none");
  }
  if (reversals.includes("none")) throw new Error("REFUSE: a reversal was not created");

  const after = Number(await net());
  const subledger = Number((await q(`SELECT COALESCE(sum(balance_cents), 0)::bigint s FROM accounting.vendor_balances WHERE operating_company_id = $1::uuid`, [USMCA]))[0].s);
  const vendorless = Number((await q(
    `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint n
       FROM accounting.journal_entry_postings p
      WHERE p.account_id = $1::uuid AND p.source_transaction_type = 'journal_entry'`, [AP]))[0].n);
  if (before - after !== TOTAL_CENTS || after !== subledger || vendorless !== 0)
    throw new Error(`REFUSE TO COMMIT: ${JSON.stringify({ before, after, subledger, vendorless })}`);
  return { reversed: reversals.length, ap_before_cents: before, ap_after_cents: after, vendor_subledger_cents: subledger, vendorless_ap_cents: vendorless };
});
