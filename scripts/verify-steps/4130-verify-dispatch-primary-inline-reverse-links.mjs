export default {
  name: "verify:dispatch-primary-inline-reverse-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-primary-inline-reverse-links.mjs"]);
  },
};
