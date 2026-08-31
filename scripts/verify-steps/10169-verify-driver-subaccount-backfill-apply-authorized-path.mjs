// LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01. Step 10169 · CC-1 lane.
export default {
  name: "driver-subaccount-backfill-apply-authorized-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-subaccount-backfill-apply-authorized-path.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-subaccount-backfill-apply-authorized-path.mjs"]);
  },
};
