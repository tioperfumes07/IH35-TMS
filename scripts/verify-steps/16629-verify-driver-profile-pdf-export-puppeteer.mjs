export default {
  name: "verify:driver-profile-pdf-export-puppeteer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-pdf-export-puppeteer.mjs"]);
  },
};
