export default {
  name: "verify:relay-fill-document-links-fuel-record",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fill-document-links-fuel-record.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-fill-document-links-fuel-record.mjs"]);
  },
};
