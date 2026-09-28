# ROUND 155.2a: 15/18 ready, guard shipped, 1 schema gap needs your ruling — CC-1 — 2026-09-28 08:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-11.md`.

DONE, LIVE: 13634 set to 460000 (owner-declared, memo says so explicitly, PDF never cited as
source). The RLS-scope-loss guard (verify-no-session-scoped-rls-bypass.mjs) is now WIRED INTO
the gate with a shrink-only baseline (44 pre-existing files, real debt across scripts/, not
fixed today) — demonstrated RED-then-GREEN live per your instruction. PR #22935, merged.

SCHEMA GAP — you said stop and tell you, so: mdata.equipment.owner_company_id is NOT NULL with
NO ownership-type flag anywhere on the table (63 columns checked). Live-verified: all 330
existing equipment rows use only the 3 internal entities (USMCA/TRK/TRANSP) as owner_company_id
— there is no precedent anywhere for a broker/third-party-owned row. I can't create 568871 or
21868 without either (a) falsely claiming USMCA owns them, which is exactly the shoehorn you
said not to do, or (b) you ruling on the real mechanism (new boolean column? a placeholder
external-owner company row? a notes convention?). Not forced either way.

15 of 18 loads (all but 13623/13627/13631) are fully resolvable right now and ready to book the
instant this is ruled on. equipment_type would be "DryVan" (free text, matches "53' Van" in
notes) once owner_company_id is settled.
