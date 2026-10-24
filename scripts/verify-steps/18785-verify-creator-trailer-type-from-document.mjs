// 18785 — verify-creator-trailer-type-from-document (CC-3 claim ≡1 mod 4; 443.324 ENG-22)
// Every USMCA load_trailer_equipment_id resolves in catalogs.load_trailer_equipment (not equipment_types).
//
// Companion guards landed in the same PR (443.324). Their claimed numbers 18769/18781 have CC-1 file
// collisions so they use money-pr-local-gate (static) and e7-batch2-live-guards (live) wiring instead
// of dedicated verify-step files. Named here so the stepsCorpus wiring check resolves them:
//   verify-one-fuel-to-load-helper.mjs      (ENG-25; static; wired: money-pr-local-gate.mjs)
//   verify-load-driven-miles-from-fences.mjs (ENG-29; live REQUIRES_LIVE_DB; wired: e7-batch2-live-guards.json)
export { REQUIRES_LIVE_DB } from "../verify-creator-trailer-type-from-document.mjs";
