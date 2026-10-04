# CC-3 2026-10-04 — fixing its own ROUND 337 defect in telematics/dashcam.service.ts (LANE_CROSS)

CC-3's ROUND 337 header sweep (dd17a57c80) changed `insertDashcamClip` to an upsert that SETs a column, which needs an
UPDATE grant ih35_app does not hold on telematics.dashcam_clips — refused at runtime, and red on main for every seat
(verify-schema-usage-grants). CC-2 traced it to that commit. Standing order: "FINISH YOUR LIST. YOU DO NOT HAND OFF"
(10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md) — the seat that wrote the defect fixes it.

Scope crossed: the single INSERT in `insertDashcamClip` (DO NOTHING + read back). Nothing else in the file.
