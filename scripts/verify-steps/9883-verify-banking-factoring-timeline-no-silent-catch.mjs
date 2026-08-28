export default {
  name: "verify:banking-factoring-timeline-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-factoring-timeline-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-factoring-timeline-no-silent-catch.mjs"]);
  },
};
