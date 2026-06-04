export default async function step(ctx) {
  if (ctx.run("npm", ["run", "verify:drivers-document-expiry-alerts"]) !== 0) {
    return 1;
  }
  return 0;
}
