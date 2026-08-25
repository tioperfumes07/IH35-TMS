// CODEX-DRIVER-CROSSMODULE-CONNECTIVITY-GUARD-REGISTRY-BATCH
// Rule 37 claim 8928 landed on origin/main in PR #15668 before this wrapper was authored.
// Each underlying guard owns its exact runtime contract; this step only makes those ratchets
// unavoidable in CI across the vertical driver column.
const GUARDS = [
  "verify-dispatch-driver-pwa-departure-shared-driver.mjs",
  "verify-dispatch-quicksave-trailer-not-codriver-uuid.mjs",
  "verify-maintenance-road-service-driver-write-authorization.mjs",
  "verify-safety-dispatch-driver-write-authorization.mjs",
  "verify-photo-comparison-detail-failure-truth.mjs",
];

export default {
  name: "verify-codex-driver-crossmodule-connectivity-guard-registry-batch",
  run(ctx) {
    for (const guard of GUARDS) {
      ctx.run("node", [`scripts/${guard}`, "--selftest"]);
      ctx.run("node", [`scripts/${guard}`]);
    }
  },
};
