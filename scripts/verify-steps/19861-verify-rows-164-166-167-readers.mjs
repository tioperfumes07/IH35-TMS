export default {
  name: "verify:verify-rows-164-166-167-readers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-164-166-167-readers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-164-166-167-readers.mjs"]);
  },
};
