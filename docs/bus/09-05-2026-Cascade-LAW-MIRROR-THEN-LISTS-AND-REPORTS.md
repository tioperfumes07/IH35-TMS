# 09-05-2026 · CASCADE · LAND THE CURRENT LAW MIRROR, THEN BUILD LISTS AND REPORTS (K.4+)
Surface: `pages/dispatch/planners/**`, `pages/lists/**`, `pages/reports/**`. USMCA only. FAST-MERGE
via `gh api -X PUT /repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash`.
`git pull --ff-only origin main`.

## VERIFIED (owner, 2026-09-05 01:40 UTC)
Your branch `cursor/land-law-doc` (d30d2112) exists on origin. Its `docs/LAW.md` header reads
"live-verified 2026-09-03 21:30" — that is the OLD revision. The current authoritative document is
the revision "live-verified 2026-09-05 00:10" (it adds the §0b telematics/Samsara/geofence ownership
row for CC-3, the GEOFENCE/TELEMATICS live state, the Love's 604-store facts, the shared-state trap
and the terminal-state trap in §8). Your branch is also behind main by 33 files. You asked for the
file — it is in the owner's Downloads as:
  `09-05-2026-Cascade-LAW-DOC-CURRENT-REVISION-FOR-docs-LAW.md`
That file IS the 2026-09-05 00:10 revision, byte-for-byte from the project.

## STEP L — LAW MIRROR (owner request, OWNER-REQUEST-REGISTER #19)
1. Rebase `cursor/land-law-doc` on `origin/main` (or start a fresh branch `Cascade-law-mirror-0905`
   from main — do not carry the 33-file drift).
2. `docs/LAW.md` = the Downloads file above, with this 3-line header prepended:
   `> MIRROR of the Claude project document 00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md.`
   `> The project copy is canonical; the lead re-syncs this file when it changes.`
   `> Mirror revision: live-verified 2026-09-05 00:10. Re-synced 2026-09-05 by Cascade.`
3. Keep the one-line stub pointer in `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`.
4. Gate → push → ready PR → same-15s squash. Post `CASCADE | STEP-L DONE | <sha>`.
No approval needed — the owner asked for the file. A stale copy of the law is the §8 stale-document
trap; do not land it.

## THEN — THE SEQUENCE
K.1–K.3 (planner bars from real loads, grid UX, design law on planners) were shipped by CURSOR
(#20373, #20377, #20382, #20390). Do not redo them. Post `K.0 ACK` and start at:
**K.4+ — Lists and Reports, BRD-01..24, ONE PR EACH, guard in the same PR, wired into
`scripts/verify-steps/`.** Design law on every list/report you touch: headers centered on `--th-bg`,
zebra, sticky header + sticky first column, 28px controls, square 2px, dash never zero/None,
gear (column show/hide/density) on every ParityTable list, voided hidden by default, sortable
everywhere. Push EVERY commit — commit `65762353` (F5 Combobox Tab-trap) is still local-only after
two days; push it FIRST or declare it dead in one line.
A defect outside your surface = ONE line in OUTBOX-CASCADE to the owning seat, then back to your PR.
No findings-only mode. No registers. No close-outs.

## FORBIDDEN
`DispatchBoard.tsx` · `DispatchKanban.tsx` · `BookLoadModalV4.tsx` · fixing CC-1/CC-2/Cursor code ·
`trigger_deploy` · seat book loads · idling · local-only commits · reseeding `VERIFY-STATIC-BASELINE.json`.
DONE for each BRD = the owner opens the list/report and it renders real USMCA rows under the design law.
Report `CASCADE | BRD-NN DONE | <sha> | NEXT BRD-NN+1`.
