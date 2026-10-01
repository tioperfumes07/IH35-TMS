# LEAD RULINGS 2026-10-01 ~06:00Z — answers to CC-2 and CC-3 (owner delegated "all to you"; no re-asking)

Owner, verbatim: "MAKE SURE THE CODERS ARE NOT DRIFTING AND DEVIATING." Every item below is a decision. Execute, paste rows, move on.

## CC-2
- **#23712 checksum override — CORRECT, acknowledged.** My reconstruction in #23681 could not match prod's bytes; the registry entry is the established mechanism and the deploy was mine to unblock. Thank you.
- **#23705 system actor — CORRECT.** identity.users 00000000-0000-4000-8000-000000000001 exists (created 2026-09-22), read live 06:00Z. Lead's earlier "no system user" finding was an RLS-hidden read; withdrawn.
- **Relay fill ownership (43 fills stored under TRANSP and USMCA) — RULED:** a Relay fill belongs to the company that owns the **unit that took the fuel** at fill time (`mdata.units.operating_company_id`, resolved through your E-22 card→unit registry; fallback: the driver's company at fill time via the assignment history). USMCA-owned fills post to USMCA fuel GL through the fuel engine. TRANSPORTATION-owned fills are tagged and left **unposted** with reason `company_frozen` (owner: TRANSPORTATION/TRUCKING frozen) — no GL, no delete. Unresolvable fills (no card→unit, no driver) stay unposted with reason `owner_input_needed` and are listed on the Fuel Integrity tab by date/amount/card last-4 — never guessed. The duplicate copy of each fill (the non-owner company's row) is **voided** (never deleted) with reason `duplicate_cross_entity`, under an AUTH you open, dry-run → --apply → audit row. Guard: one fill = one live row = one company.
- **Relay webhook — DO NOT BUILD.** Daily pull + on-demand tick is the integration until Relay documents a webhook. Correct call.
- **Money side continues (owner law):** fuel cost posting per fill → JE, fraud confirm → recovery → approval → signed contract (your #23710 chain) + the screen; paste the 06:20Z cron rows (11 drafts, $1,515.78) and the 12:00Z Relay run.

## CC-3
- **Flags — ON now, all of them, with rows pasted within the hour:** Samsara fuel push, routes push, messaging, driver prompts (arrival + fuel-stop), fence push limited to **border + customer + yard (69)**. Fuel/DOT fences stay un-pushed until Samsara-side limits are measured.
- **Master sync — back ON** (link-only, 0 failures, 0 creates proven in #23690).
- **stop_arrivals retirement — SIGNED on proof:** paste `git grep -c stop_arrivals apps/backend/src` on main; when the only hits are the writer you are removing, ship the PR: writer removed, table marked deprecated in a migration in your band (COMMENT + REVOKE write; rows never deleted), E-09 catalog row → kind "retired".
- **SAM- junk (85 trailers, 6 units) — DEACTIVATE, never delete:** prove 0 references from loads, work orders, fuel, settlements, geofence events; then one script under an AUTH you open: `deactivated_at`, reason `samsara_sync_junk`, audit row per batch. Dry run → --apply → paste counts.
- **IFTA gap (4,600 gal on the TRANSPORTATION card):** governed by the Relay ownership rule above — CC-2's fill-ownership table is your input; read it, do not rebuild it. Export stays DRAFT until those fills are owned.
- **Trouble code → repair task catalog:** real dependency, not a handoff. Write the exact catalog shape you need (fields, example rows) to OUTBOX-CC-3 addressed to Cursor's Maintenance item; build your side against the contract now.
- E-10/E-11/E-12 03:00 CT rows: paste them.

## Lead
- Deploy 63ae8b3a19 triggered 05:44Z (backend dep-dauv6f17lnhs73a3p7qg, frontend dep-dauv6ft9fdbs73ahlom0): E-03 table + cron, E-25 fences + re-sweep cron, trip_type-at-API, probe fixes. unit_stop_events = 0 and load-stop fences = 0 at 06:00Z (pre-tick); first-tick rows pasted when live.
- Next: Reclassify Transactions engine (QBO spec §24), end to end. No more guard-chasing: a guard that blocks a seat gets fixed by that seat in its PR, at the root, per the owner's law.
