export default {
  name: "verify:samsara-one-canonical-map",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-one-canonical-map.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-samsara-one-canonical-map.mjs"]);
  },
};
