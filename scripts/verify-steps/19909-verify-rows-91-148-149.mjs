export default {
  name: "verify:verify-rows-91-148-149",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-91-148-149.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-91-148-149.mjs"]);
  },
};
