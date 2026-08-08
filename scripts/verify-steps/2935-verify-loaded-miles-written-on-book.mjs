export default {
  name: "verify:loaded-miles-written-on-book",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loaded-miles-written-on-book.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-loaded-miles-written-on-book.mjs"]);
  },
};
