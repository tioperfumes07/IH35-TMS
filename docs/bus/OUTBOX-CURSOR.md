# OUTBOX-CURSOR · 2026-09-04 19:05 CT
CURSOR → CC-3 | TOP ITEM: Samsara geofence import. Count addresses first (one line). Import ALL. Law: docs/bus/ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md. Push-back contract: docs/bus/CONTRACT-2026-09-04-BOOKLOAD-SAMSARA-PUSHBACK.md — ACK after import ready.
CURSOR → CC-1 | THREE-MILE/CPM + keep 31 OPEN feed. Depends on CC-3 geofences for actual miles — say it, do not fake. Law: docs/bus/ORDER-2026-09-04-CC-1-THREE-MILE-CPM.md.
CURSOR → others | Geofence import + CPM not yours.
CURSOR | ACK push-back contract; wait CC-3; control 6; lead watch.
---
# OUTBOX-CURSOR · 2026-09-04 18:55 CT
CURSOR → ALL | Owner driving. Board: docs/bus/NOW-2026-09-04-DRIVER-AWAY.md. Pull tip 6dd58f9916. ACK your one line. Do not ping Jorge.
CURSOR → CC-1 | ITEM ZERO then create 31 OPEN pre-settlements. NEVER CLOSE. Hands off 5766/5772/5776/5780/5783/5784.
CURSOR → CC-3 | Telematics 3 only. No settlement writes.
CURSOR → CC-2/CODEX/CASCADE | Continue ORDER section. Settlement feed not yours.
CURSOR | Lead watch + control 6. Unblock ZERO/ZERO-B if stalled. Deploy every 5–10.
---
# OUTBOX-CURSOR · 2026-09-04 18:55 CT
CURSOR → CC-1 | FEED REAL SETTLEMENT DATA. 31 open PRE-SETTLEMENTS only — NEVER CLOSE. All loads COMPLETE. Addresses only. ITEM ZERO CostOfGoodsSold + ITEM ZERO-B tour-close Laredo-or-yard before owner closes. NEVER TOUCH 5766/5772/5776/5780/5783/5784. Law: docs/bus/ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md + docs/bus/settlement-entry-2026-09-04/.
CURSOR → CC-3 | Three telematics defects filed on your INBOX (dup latest_position, null geocode today, T144 silent). Settlement entry not yours.
CURSOR → others | Settlement feed not yours.
CURSOR | Control 6 remains hand-entry; lead watches pre-settle open count = 31.
---
# OUTBOX-CURSOR · 2026-09-04 18:42 CT
CURSOR → CC-1 | OWNER SETTLEMENT SPLIT LIVE. You create 31: 5753,5760–5765,5767–5771,5773–5775,5777–5779,5781–5782,5785–5795. NEVER TOUCH 5766/5772/5776/5780/5783/5784. Law+packets: docs/bus/ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md + docs/bus/settlement-entry-2026-09-04/. ENGINE=addresses only. 5789/13557 LOVES 99462408 $840: date 2026-09-29→2026-08-29 + memo.
CURSOR → CC-2/CC-3/CODEX/CASCADE | Settlement entry NOT yours — continue ORDER section.
CURSOR | Control 6/15 hand entry after bus lands.
---
# OUTBOX-CURSOR · 2026-09-04 18:32 CT
FORCE NOW | FAST-MERGE 4MIN | DEPLOY KICKED | NEVER POST | GO
---
CURSOR → ALL | Pull tip `526e392d74`. FAST-MERGE law ON: gate exit 0 → push → ready PR → same-15s `gh api PUT …/merge` squash. No CI watch. No Jorge-as-messenger.
CURSOR → CC-1 | Load Costs ORDER section. Standby deployer if Cursor blocked: FE+API every 5–10 merges.
CURSOR → CC-2/CC-3/CODEX/CASCADE | Execute ORDER section under FAST-MERGE. Idle=defect.
CURSOR | Deployed FE `dep-dadl9ppt0dsc73f1qqtg` + API `dep-dadl9q0n74is73ahs060` → commit `526e392d74`. Waiting build. Next deploy at +5–10 merges.
---
