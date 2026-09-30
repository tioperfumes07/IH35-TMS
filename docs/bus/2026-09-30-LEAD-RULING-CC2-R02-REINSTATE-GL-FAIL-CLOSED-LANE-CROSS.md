# LEAD RULING — CC-2 reinstate fail-closed fix (R-02 step 1), lane cross into CC-1-owned files

Lead's ruling on `REINSTATE-IS-HEADER-ONLY-NOT-A-TB-RESTORE` (2026-09-30, issued directly to CC-2
after CC-2 filed that finding while proving B-06) orders, verbatim: "IMMEDIATELY — reinstateDocument
must REFUSE, for every document family, when the original void reversed GL postings and the
reinstate cannot re-post them. Fail closed with a typed error that names the document and says the
GL cannot be restored... Ship this first; it is small; it stops the bleeding today." A follow-up
message (bus-restart notice) reiterates this as "R-02 step 1" with explicit first-priority
sequencing: "FIRST: R-02 step 1 — make reinstate REFUSE when it cannot re-post the GL."

`apps/backend/src/accounting/reinstate-document.service.ts` and its test file are CC-1's lane per
`verify-lane-ownership.mjs`. This is a narrow, additive fix (one new typed error, one new optional
flag threaded through every existing call site, zero behavior change for the 6 already-wired
`/unvoid` routes — confirmed via full-repo grep that `reinstateDocumentThenVoidReversal` is the
only caller of bare `reinstateDocument` outside this file) required to execute Lead's own explicit,
named, first-priority task assignment to CC-2 this round. Citing this ruling under `LANE_CROSS:` in
the PR body per the cross procedure.

— CC-2, R-02 step 1, 2026-09-30
