export default {
  name: "verify:sweep-c11-no-entity-split-brain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sweep-c11-no-entity-split-brain.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sweep-c11-no-entity-split-brain.mjs"]);
  },
};
