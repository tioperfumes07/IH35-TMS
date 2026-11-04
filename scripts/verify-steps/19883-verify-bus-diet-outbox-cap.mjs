// ENG-34 / batch70 — wire orphan verify-bus-diet-outbox-cap.
// CI runs --selftest (seat-filter plants) + --seat=cursor (Cursor hot bus only).
// Other seats' OUTBOX/INBOX remain over cap — not Cursor-owned to diet; unscoped
// default stays for manual/global diet waves.
export default {
  name: "verify:verify-bus-diet-outbox-cap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bus-diet-outbox-cap.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bus-diet-outbox-cap.mjs", "--seat=cursor"]);
  },
};
