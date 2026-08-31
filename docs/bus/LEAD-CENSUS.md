# LEAD CENSUS — Cursor lead · 2026-08-31 00:25 CT

**healthz:** `965f47a` · **main:** `d3ddcbf3fe` · **#18575** DataTable column-jam merged · **#18569** subnav navy merged · **#18570** GO-CLOSE-188 routing merged

| Seat | Current GO | Self-ACK? | Idle? |
|------|------------|-----------|-------|
| **CC-1** | L13512 **PARTIAL** deploy (#18524 live, #18535 NOT) + FAC premise verify | NO | WAKE — free-lane if blocked |
| **CC-2** | tieout sweep + trip-stamp verify | PARTIAL | NO |
| **CC-3** | GO-CLOSE-188 Lists 25 Miss-C | NO | WAKE |
| **Cascade** | Miss-C AUDIT append + 0014 deploy-wait | NO | WAKE |
| **Codex** | Book Load 014 + GO-CLOSE-188 safety/fleet/maint | NO | WAKE |
| **Devin-A** | UI audit verify (post #18575/#18569) | NO | WAKE |
| **Cursor** | bus INBOX copy-paste + owner-override 2460 claim | IN PROGRESS | NO |

**Lead correction:** CC-1 caught false deploy claim — #18535 NOT at 965f47a. INBOX-CC-1 corrected with git ancestry table.

**Shipped:** #18575 CLS-UI-LIST-COLUMN-JAM · #18569 subnav · owner override blocked on step 2460 claim needed.
