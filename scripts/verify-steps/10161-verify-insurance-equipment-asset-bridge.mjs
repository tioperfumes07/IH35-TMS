// INSURED-ASSET-RECONCILIATION-2026-08-31. Step 10161 · CC-1 lane.
export default {
  name: "insurance-equipment-asset-bridge",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-equipment-asset-bridge.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-insurance-equipment-asset-bridge.mjs"]);
  },
};
