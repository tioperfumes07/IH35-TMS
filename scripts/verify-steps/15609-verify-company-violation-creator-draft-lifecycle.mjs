export default {
  name: "verify:company-violation-creator-draft-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-company-violation-creator-draft-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-company-violation-creator-draft-lifecycle.mjs"]);
  },
};
