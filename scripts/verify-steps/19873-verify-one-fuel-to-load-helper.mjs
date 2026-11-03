// ENG-34 / batch70 — wire orphan verify-one-fuel-to-load-helper (static; no DB).
export default {
  name: "verify:verify-one-fuel-to-load-helper",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-fuel-to-load-helper.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-one-fuel-to-load-helper.mjs"]);
  },
};
