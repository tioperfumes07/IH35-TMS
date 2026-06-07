# GAP-92 — Feature Flag System

Per-tenant and per-user feature flags for soft-launching capabilities without a full deploy rollback.

## Architecture

- **Storage:** `lib.feature_flags` (global flag metadata) and `lib.feature_flag_overrides` (tenant/user overrides).
- **Resolution order:** user override → tenant override → rollout percentage (deterministic hash on `user_uuid`) → `default_enabled`.
- **Admin API:** Owner-only CRUD on `/api/feature-flags*`.
- **Runtime check:** authenticated `GET /api/feature-flags/check?key=`.

## Schema

Migration: `db/migrations/0408_feature_flags.sql`

## Frontend

- `useFeatureFlag(flagKey)` — cached hook with 60s refresh via `feature-flags-client.ts`.
- `/admin/feature-flags` — `FeatureFlagsManager` for Owner role.

## Verification

```bash
npm run verify:feature-flags
npm run block-ready -- --manifest .block-ready/GAP-92-FEATURE-FLAG-SYSTEM.json
```

## Related

- `admin.launch_toggles` (USMCA carrier soft-launch) remains separate — carrier visibility, not per-feature rollout.
