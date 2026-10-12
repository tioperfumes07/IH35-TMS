# CODEX | 2026-10-12 11:51 AM CT (16:51Z) | ROUND 443.115 BCF-09

Lead's explicit owner assignment in ROUND 443.115 assigns BCF-09 to CODEX: resolve the selected native pay item, write its item/account, and prove the route against the database CHECK. ROUND 443.117 keeps BCF-09 first.

LANE-CROSS: this assignment covers the settlement pay-line service and route, the settlement-close pay-item reader required to preserve the selected account into the existing A/P poster, their tests, and the AddPayLineModal/API contract. It also covers registering the regression guard in LAW.json and the shared money gate. No other posting behavior, writer ownership, database constraint, or baseline is changed.

Production remains read-only. Regression fixtures use a fresh local PostgreSQL 16 database and an isolated non-production company in a rolled-back transaction. No production fixture, correction, seed, raw query rows, or account details are published.

CODEX | 2026-10-12 12:26 PM CT (17:26Z) | LANE-CROSS: owner explicitly extended this same BCF-09 PR to scope every executed money-gate reader to USMCA using bound parameters, retaining every assertion and all trigger/function/migration-ledger checks. Includes send-back guard, load-born lineage guard, invoice spine-link guard and shared bank-feed reader visibility count. Two-company fixtures exist only in transaction-local temporary tables on isolated PostgreSQL 16; no production data writes or database refusal changes.
