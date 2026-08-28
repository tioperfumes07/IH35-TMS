export default {
  name: "verify:book-load-single-submit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs"]);
    ctx.run("node", ["scripts/verify-live-load-id-reservation-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-live-load-id-reservation-lifecycle.mjs"]);
  },
};
