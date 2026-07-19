// B-D2 orphan guard — dead frontend components ratchet (baseline burn-down). Non-financial;
// was package.json-only; Rule 17 verify-step wiring (no locked-guards/package.json edits).
export default {
  name: "verify-orphan-components",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-orphan-components.mjs"]) !== 0) {
      throw new Error("verify-orphan-components failed");
    }
  },
};
