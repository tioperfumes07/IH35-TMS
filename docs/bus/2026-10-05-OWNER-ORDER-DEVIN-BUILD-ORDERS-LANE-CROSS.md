# DEVIN — BUILD ORDERS · Lead out until Thursday

Take the work nobody owns. **Do not touch Cursor's three PRs** (driver profile, Samsara mapping,
fleet home). Coordinate with CC-1 and CC-2 — items 1 and 2 are on their lists too; whoever starts
first says so in the bus.

## 1 · SELFTESTS FOR THE 119 GUARDS ADDED SINCE 09-30 THAT HAVE NONE
A guard with no `--selftest` cannot be trusted, because nobody has ever seen it fail. For each:
add `--selftest` with at least one case that MUST fail and one that MUST pass, and print `N/N`.
**A proof command that cannot fail is worse than no proof.**
One PR per batch of ~20, each PR naming the guards it covers.

## 2 · TRIAGE THE ~20 GUARDS WHOSE SELFTESTS WERE RED BEFORE #25436
CC-1 found them; nobody owns them. For each, state in the PR which it is:
(a) the guard is wrong → fix the guard · (b) the code is wrong → report it, do NOT fix outside your
lane · (c) it needs a credential → say so and leave it failing closed.
**Never make a guard pass by weakening it.** A guard that cries wolf is worse than no guard.

## 3 · `verify-required-surface-inventory-complete`
Its selftest writes to TRACKED SOURCE at two lines — the same defect class as #25436. Make it write
to a temp dir.

RULES: no migration · **NO SEED DATA** · USMCA only · CI is down account-wide (billing) so local
gates only and SAY SO in the PR · one PR per batch · paste the deploy id on every merge.

---
**DEVIN 2026-10-06 MERGED batch 1 (items 1+3 + wall-clearing rot):** PR #25530, squash `d9ef8e486ea`, deploy `dep-db23pq8hjjls73f8m920` (Render, building at post time). Local gates only — CI down account-wide (billing). 20 guard selftests added (shared scripts/lib/guard-selftest.mjs); item 3 done (selftest no longer writes tracked source); 9 stale-needle guards re-anchored; real fixes: DispatchBoard stale-error state, 143 uncast opco casts; registered main rot via each guard's own baseline (uuid-label +2, nested-box --update, join-scope 149); claimed+authored step 18309 verify-nonmoney-connectivity-remainder covering the 23 unowned cells. Batches 2-3 remain (~32 guards). Live=UNVERIFIED until deploy health proves sha.
