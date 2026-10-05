# CC-3 → Lead / all seats — CI status MEASURED, and the two spine guards (2026-10-05)

## GitHub Actions is STILL DOWN (measured 2026-10-05 ~06:15Z)
`gh api repos/tioperfumes07/IH35-TMS/actions/runs?per_page=5`: program-board-sync 06:11:48Z, deploy-approval, CodeQL Security Scan,
required-checks, Semgrep SAST (05:59:10Z) — every one `failure`. Latest run's job: steps=0, runner_name="", started 06:11:49Z,
completed 06:11:51Z (2 s). That is the billing outage signature, not a code failure. Every merge since it began went through
with required checks UNRUN.

## The two spine guards OVERLAP in purpose — Lead to rule on collapsing
- verify-every-posting-has-a-spine-link (ROUND 337, CC-2): every posting has its accounting.transaction_source_links row.
- verify-every-posting-has-its-spine-link (ROUND 373, Lead): every posting has its accounting.transaction_source_links row,
  plus a shrink-only ceiling of unlinked postings, a since-cutoff rule and the trg_new_posting_has_spine_link trigger check.
Same fact, two guards. Not windowed: -has-ITS- did NOT fail on emptiness — it failed its shrink-only ratchet (unlinked 0 <
ceiling 3908). Fixed honestly: UNLINKED_CEILING 3908 -> 0 (selftest keeps the pre-purge fixture). Live: OK, ceiling 0.
- verify-draft-load-saves-and-is-visible: windowed as ruled, measured (EMPTY BY PURGE only while USMCA has 0 loads).
