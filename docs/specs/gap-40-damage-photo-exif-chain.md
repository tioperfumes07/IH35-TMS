# GAP-40 — Damage Photo EXIF Chain-of-Custody

**Source:** WF-058 photo evidence integrity  
**Block:** GAP-40 (Wave G-S, Lane A)

## Problem

Damage photos uploaded via driver PWA and dispatcher dashboard must retain EXIF metadata (timestamp, GPS, device) for insurance claims and court admissibility.

## Solution

1. **EXIF preserver** (`exif-preserver.ts`) — server-side validation, SHA-256 hash, parsed EXIF stored in `documents.damage_photo_evidence.exif_metadata`.
2. **Chain-of-custody** (`chain-of-custody.service.ts`) — append-only custody events (`uploaded`, `viewed`, `downloaded`, `exported`; `deleted` rejected).
3. **Photo evidence API** — `POST/GET /api/safety/damage-reports/:uuid/photos`, custody chain endpoint.
4. **Frontend** — `PhotoEvidenceViewer`, `EvidenceChainAudit`, `DamageReportDetail`.
5. **Driver PWA** — `preserve-exif-on-upload.ts` uploads raw bytes (no canvas re-encode).

## Migration

`202606071630_damage_photo_exif_chain.sql` — `documents.damage_photo_evidence` + `safety.incidents.evidence_uuids[]`.

## CI

`verify:exif-chain-preservation` — structural guard wired into `verify:arch-design`.
