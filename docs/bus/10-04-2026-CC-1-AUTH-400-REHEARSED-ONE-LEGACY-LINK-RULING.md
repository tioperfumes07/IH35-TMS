# CC-1 → Lead — AUTH-400: rehearsed to zero; ONE legacy link needs your word before the prod run (2026-10-04)

## Landed
#25423 (ACCT-F9982, 084aee5bf0) — the root causes the two rehearsals surfaced, each fixed at its single entry point and guarded. Full proof in the commit.
- **Reversal links in both directions, always.** The one posting-line writer now stamps the original's `reversed_by_line_id`. The unique index `uq_jep_one_reversal_per_line` (migration 202615410300) makes a second reversal impossible from any writer.
- **Document void** reverses every LIVE line naming the document. It refuses an unbalanced set and never overwrites a back-link.
- **Restore** refuses to duplicate an original the entry did not cancel.
- **Settlement A/P chain** refuses a GL-bill row without its bill or cash entry.
- **Escrow:** a sourced deposit replays its first posting instead of posting again.
- **Purge engine** lists every planned row under the AUTH, and its gate report recognises ARM L.
- **Void stage:** reclassify undo first, then documents newest-first, then live JEs newest-first, repeated while progressing.
- **Guards:** verify-reversal-links-both-directions (step 18109) and verify-settlement-gl-bills-link-their-entries (step 18105).

## Rehearsal-2 (br-small-leaf-akjde74y, fresh copy of prod, this code)
```
reclassify_undo 4 · customer_payment 7 · invoice 104 · expense 536 · journal_entry 296 · lines reversed twice 0
live left: 4 lines / 2 entries — every one from ONE legacy one-sided link:
  expense d1c72fca: "live lines … do not balance (2459c) — refusing a partial reversal"
  JE 7e36960c: refused by uq_jep_one_reversal_per_line
after completing that link on the branch: live 0 · double-reversed 0 · one-sided 0
```
The 37 settlement refusals are the 09-28 ROUND 148 document-only adoption shape. Their GL is voided by the JE pass, and the new chain refusal stops that shape from being written again.

## RULING NEEDED — one word
Reclass batch `c8375b8f` (2026-10-04 03:29, before the writer fix) wrote out-leg `34b485eb` reversing expense line `8314452b` but never stamped `8314452b.reversed_by_line_id`. That is the only one-sided link on prod (measured). Every engine now refuses that expense, correctly.
- **COMPLETE** (recommended): under AUTH-400, write that one missing back-link `8314452b → 34b485eb` on prod. It is exactly what the fixed writer writes automatically now. It is a link, not a figure, and rehearsal-2 shows it plus the normal void reaches zero.
- **EXCEPT:** name this one expense as a purge-plan exception instead.

Then: Neon backup branch → prod void stage (branch-pinned, AUTH-400) → purge APPLY → proof (postings 0, entries 0, TB 0 = 0, 1,009 bank lines back in For Review, master data intact). Nothing on prod is touched until then.
