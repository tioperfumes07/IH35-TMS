export default {
  name: "verify:presettlement-tour-id-never-null",
  run(ctx) {
    ctx.run("node", ["scripts/verify-presettlement-tour-id-never-null.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-presettlement-tour-id-never-null.mjs"]);
  },
};
