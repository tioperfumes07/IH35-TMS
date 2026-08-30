import { replay, deriveStatus } from "./proof-engine.mjs";
const ctx = { base:"https://api.ih35dispatch.com", fetch:(u,o)=>fetch(u,o), exec:async()=>0 };
const liveSha = (await (await fetch(ctx.base+"/api/v1/healthz/shallow")).json()).version;

// A REAL item, written the new way: no status field, no prod_verified field — only proofs.
const item = {
  id: "SYS-HEALTHZ-01",
  title: "API healthz reports all critical checks green",
  proven_at_sha: liveSha,
  proofs: [
    { kind:"http", path:"/api/v1/healthz/shallow",
      expect:{ status:200, json_path:"$.ok", op:"==", value:true } },
    { kind:"http", path:"/api/v1/healthz/shallow",
      expect:{ status:200, json_path:"$.version", op:"exists" } },
  ],
};
const results = [];
for (const p of item.proofs) results.push(await replay(p, ctx));
const verdict = deriveStatus(item, results, liveSha);

console.log("live sha:", liveSha);
results.forEach((r,i)=>console.log(`  proof[${i}] ${r.kind}: ok=${r.ok} observed=${r.observed} ${r.ms}ms`));
console.log("\nDERIVED VERDICT:", JSON.stringify(verdict,null,1));

// now prove it self-invalidates: same results, but pretend the code moved
const stale = deriveStatus({...item, proven_at_sha:"deadbee"}, results, liveSha);
console.log("\nSAME PROOFS, OLDER SHA ->", stale.status, "|", stale.why);
