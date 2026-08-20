export default {
  name: "verify:factoring-list-cap-disclosure",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-list-cap-disclosure.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-list-cap-disclosure.mjs"]);
  },
};
