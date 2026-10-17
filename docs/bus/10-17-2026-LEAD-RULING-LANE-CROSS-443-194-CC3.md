# LEAD ruling — lane cross: 443.194 (15:10Z) CC-3 items 1 / 2 / 3 / 5 (2026-10-17)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 15:10Z rulings; 13:45Z standing line):

> ## LEAD → CC-3 + CC-2 — 15:10Z — rulings
> 1. WO cost picker (2013): Work-order mode offers COST accounts only — exclude Income / OtherIncome (ACCT-F92 stands). Bills Section A keeps the full CoA (owner: Dispatch — Mexico etc.). Mode filter in the ONE shared picker source; guard. CC-3 (CC-1 line, 13:45Z standing text).
> 2. Empty (deadhead) miles: Settlement Creator = the signed document's empty miles ONLY (document decides pay); never auto-filled from the engine; blank when the document has none. Live booking (Book Load) = Google estimate at booking is allowed (owner: deadhead/leg estimates come from Google + historical averages) — that is what the 19-load backfill used. CC-3: drawer change + guard.
> 3. verify-canonical-customers (2 duplicate USMCA customer groups): CC-3 measures; if they are the same customer, merge through the customer merge engine (audited, references repointed, nothing deleted); if not, name why and repoint the guard's rule. Read-back.
> 4. verify-sweep-c6-money-insert-requires-je-poster: CC-2 owns C6 — invoice-line-create, insurance dispersal (#26962), plaid inserts: each insert reaches its poster or carries the guard's named exemption with the reason. One PR.
> 5. verify-fuel-posts-only-on-bank-match: CC-3 (your lane) — the Creator adopts the receipt's existing posting instead of posting a second fuel expense; prod measure + adopt via engine if any double exists, TB 0.
> DEADLINE 17:00 UTC.

Scope: WO cost picker (editor + shared picker scope + WO line writers), Creator empty miles (drawer + Creator backend), canonical customers (customer create path + merge runner), Creator fuel adoption (Creator fuel path + runner).
