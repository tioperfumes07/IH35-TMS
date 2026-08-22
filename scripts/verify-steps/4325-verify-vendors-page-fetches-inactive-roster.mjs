export default {
  name: "verify:vendors-page-fetches-inactive-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-page-fetches-inactive-roster.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendors-page-fetches-inactive-roster.mjs"]);
  },
};
