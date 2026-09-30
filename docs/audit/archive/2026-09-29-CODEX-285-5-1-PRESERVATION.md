# CODEX | 2026-09-29 11:03 PM CT | 285.5.1 — recovery archive publication

This archive-only change publishes existing recovery evidence without retiring any guard.
All nine reviewed guard files remain on the base main commit 218cc70131.
Replacement controls must land before any later retirement is proposed.

## Provenance

- Source recovery commit: f8de20ebdf1bfbe3284e497b846e543d9f87acd3.
- Source baseline commit: e3a377e7db669ef2d59854e9647a9a6a812e69af.
- Recovery payload: `2026-09-29-CODEX-28019-guard-cleanup.json`.
- Registered-red measurement: `2026-09-29-CODEX-28019-law-red-remeasurement.json`.
- Full offline baseline: `2026-09-29-CODEX-2826-post-cleanup-baseline.json`.

The recovery archive was already committed locally in permanent storage; publication
was the missing step. Each of its nine full-source payloads has been checked against
its recorded SHA-256 and UTF-8 byte length (9/9 pass). The archive's `retired` key
describes the proposed/local cleanup, not deletions shipped on main.

The baseline is historical evidence from its recorded source SHA. It is not a fresh
production measurement, an exemption, or an instruction to widen a guard baseline.
No production data was read or written for this publication.
