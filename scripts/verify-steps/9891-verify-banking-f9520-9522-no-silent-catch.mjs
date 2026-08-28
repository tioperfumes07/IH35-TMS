export default {
  name: "verify:banking-f9520-9522-no-silent-catch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-f9520-9522-no-silent-catch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-f9520-9522-no-silent-catch.mjs"]);
  },
};
