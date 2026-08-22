export default {
  name: "verify:customers-page-fetches-inactive-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-page-fetches-inactive-roster.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-page-fetches-inactive-roster.mjs"]);
  },
};
