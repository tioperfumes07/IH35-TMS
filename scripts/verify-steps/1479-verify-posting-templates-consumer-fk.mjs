export default {
  name: "verify:posting-templates-consumer-fk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-templates-consumer-fk.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-posting-templates-consumer-fk.mjs"]);
  },
};
