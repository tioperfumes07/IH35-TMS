═══════════════════════════════════════════════════════════════
BLOCK C2 — FACTORING-PROFILE
Phase C.
═══════════════════════════════════════════════════════════════

GOAL
A proper factoring company profile (the FACT tab, /accounting/factoring) so factored
invoices link to a configured factor with its terms, advance rate, reserve, fees.

SCOPE
  - MIGRATION db/migrations/<ts>_c2_factoring_profile.sql:
      schema factoring (or extend existing); table factoring_profile
      (name, advance_rate, reserve_pct, fee_schedule, remittance details, is_active,
       audit cols, updated_at trigger). RLS + NULLIF. "declare", no gen-col chains.
      Spine writes via log_event() on create/update.
  - Routes (factoring.routes.ts, standard auth pattern): CRUD profile (create/update
    are state changes → emit audit events; gate any money-moving action for later).
  - Link factored invoices → the chosen factoring_profile.
  - If a UI change touches the existing FACT page → visual preview first.

PRE-PUSH Postgres validate (EXIT:0). verify-factoring-profile.mjs: schema + RLS +
spine emit on mutations.
Push BLOCK_ID=C2-FACTORING-PROFILE, ls-remote, PR. Report PR# + SHA.
