export default {
  name: "verify:factoring-posting-legs-match-header",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-posting-legs-match-header.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-posting-legs-match-header.mjs"]);
  },
};
