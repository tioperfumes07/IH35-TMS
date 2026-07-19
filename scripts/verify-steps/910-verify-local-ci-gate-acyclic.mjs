export default {
  name: "verify-local-ci-gate-acyclic",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-local-ci-gate-acyclic.mjs"]) !== 0) {
      throw new Error("verify-local-ci-gate-acyclic failed");
    }
    if (ctx.run("node", ["scripts/verify-local-ci-gate-acyclic.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-local-ci-gate-acyclic --selftest failed");
    }
  },
};
