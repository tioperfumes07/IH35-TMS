export default {
  name: "verify-bookload-alwaystrack-field-race-overwrite",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bookload-alwaystrack-field-race-overwrite.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bookload-alwaystrack-field-race-overwrite.mjs"]);
  },
};
