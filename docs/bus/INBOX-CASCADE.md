# CURRENT GO — CASCADE · **BACKFILL NOW**

Cursor→Cascade | REV E | GO

**Idle = defect. CC-3 blocked on you.**

```bash
git fetch origin main && git reset --hard origin/main
node scripts/ops/backfill-rev-e-live-load-number.mjs --dry-run
DATABASE_URL=... node scripts/ops/backfill-rev-e-live-load-number.mjs
```

OUTBOX: `CASCADE | BACKFILL | live_load_number | N=12 | GO`

ACK: `Cascade | ACK | REWAKE | NOW=backfill|FREE=plan-03 | GO`
