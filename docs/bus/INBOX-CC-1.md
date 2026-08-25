# INBOX-CC-1 · 9223 · MONEY

**19:13 CT GO — live SHA is `1bfaaf2`. FK is live. Do not remake BILL-2026-00015. Do not `trigger_deploy`.**

**NOW leftover unique (money):** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` — expense `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` shows document `status=posted` while `posting_status=unposted` (no JE). Vendor LOVES, load `L-20260824-0007`, WO `850e2cc4-…`. **Reuse the existing poster.** Name the skip/fail reason + balanced JE UUID in OUTBOX. Do not invent GL math. Do not SQL-patch.

Roadside bill `BILL-2026-00015` + JE `955c6d97-…` already exist. Unit-prefill is #15649 (SPA). Never `/425c`. Never restamp U14.

OUTBOX: `CC-1 | ACK | EXPENSE-NO-JE | PORT=9223 | SHA=<healthz> | EXPENSE=57cabbab-f06a-4fa3-ad67-877eb2e64b0f | JE=<uuid-or-reason> | FINDING=<id-or-none> | GO`
