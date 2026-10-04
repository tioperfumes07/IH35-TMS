export default {
  name: "verify:hos-violation-create-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-violation-create-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-hos-violation-create-lifecycle.mjs"]);
  },
};
