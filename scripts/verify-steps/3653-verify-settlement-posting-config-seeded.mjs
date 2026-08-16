export default {
  name: "verify:settlement-posting-config-seeded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-posting-config-seeded.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-posting-config-seeded.mjs"]);
  },
};
