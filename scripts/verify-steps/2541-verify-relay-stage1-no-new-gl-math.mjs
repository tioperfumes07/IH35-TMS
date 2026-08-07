// CONN-3 stage 1 must express a Relay wallet funding as a TRANSFER and reuse the existing poster —
// no second double-entry implementation. Step 2541 · CC-1 lane (n%4==1), claimed on main by #4357.
export default {
  name: "relay-stage1-no-new-gl-math",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-stage1-no-new-gl-math.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-relay-stage1-no-new-gl-math.mjs"]);
  },
};
