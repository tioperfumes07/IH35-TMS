# UNIFIED PLATFORM OPERATING LAW (excerpt update 2026-07-26 — label gate)

Full file supersedes chat. Companion: `PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26.md`.

## Owner ruling — merge authorization

1. Jorge does **not** click `JORGE-APPROVED` or review PRs as an engineer.  
2. Unanswered questions are inventoried **before coding** (per module / packet).  
3. Devin merges on **CI green**.  
4. `hold-merge-gate` does **not** require the owner label; it only fails if a held migration lacks the db-migrate firewall.  
5. Agents never fabricate owner approval. Neon apply remains Cursor/owner-ordered prepare+apply.

## Roles (unchanged otherwise)

Jorge = decisions + Neon authorize when needed · Devin = merge · Cursor = build/apply · Claude = plan/CPA.
