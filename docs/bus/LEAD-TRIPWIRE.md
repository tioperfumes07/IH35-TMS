# LEAD TRIPWIRE — one page

After `LEAD-CONTRACT.md` is on `origin/main`, if Cursor matches **T1–T6** in that file:

```bash
node scripts/ops/activate-claude-lead.mjs --reason="T#"
```

Then FAST-MERGE. Stop leading. Claude reads `CLAUDE-LEAD-NOW.md` (also prepended to INBOX-CC-1).
