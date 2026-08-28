export default {
  name: "verify:banking-factoring-f9515-9518-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-factoring-f9515-9518-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-factoring-f9515-9518-no-silent-catch.mjs"]);
  },
};
