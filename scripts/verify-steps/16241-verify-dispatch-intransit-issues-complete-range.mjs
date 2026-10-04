export default {
  name: "verify:dispatch-intransit-issues-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-intransit-issues-complete-range.mjs"]);
  },
};
