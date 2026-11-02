export default {
  name: "verify:dvir-correction-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dvir-correction-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dvir-correction-lifecycle.mjs"]);
  },
};
