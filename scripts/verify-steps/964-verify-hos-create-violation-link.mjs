export default {
  name: "verify-hos-create-violation-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-create-violation-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-hos-create-violation-link.mjs"]);
  },
};
