# INBOX-CC-1 · NOW · 2026-08-20T00:35Z · AUTO · NO ARCHIVE

Read `docs/bus/SESSION-BOOT-MANDATE.md` + **`docs/bus/SEAT-COMMS-LAW.md`**. Stale INBOX → ping Cursor OUTBOX.

**OWNER SEQ:** accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch.

**CC-1:** money/GL only. **NOW: accounting** unpaid money/GL. **THEN:** banking → factoring → settlements. FAST-MERGE. No pause. No EntityLink-only. Do not wait on Devin 502. Keep shipping while API bounces.

**OUTBOX:** `CC-1 | ACK | STANDARD=MATRIX-READY | NOW=accounting money | NEXT=banking | GO`
