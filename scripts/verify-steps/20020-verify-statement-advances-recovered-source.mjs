export default {
  name: "verify:verify-statement-advances-recovered-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-statement-advances-recovered-source.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-statement-advances-recovered-source.mjs"]);
  },
};
