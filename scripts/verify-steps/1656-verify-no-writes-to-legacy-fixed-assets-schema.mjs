export default {
  name: "verify:no-writes-to-legacy-fixed-assets-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-writes-to-legacy-fixed-assets-schema.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-writes-to-legacy-fixed-assets-schema.mjs"]);
  },
};
