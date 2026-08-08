const SCRIPT = "scripts/verify-pod-bol-evidence-linkage.mjs";
export default {
  name: "verify:pod-bol-evidence-linkage",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
