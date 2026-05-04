import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";
import crypto from "node:crypto";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_EVIDENCE;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("FAIL: missing one of R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_EVIDENCE");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const key = `verify/phase-0-${Date.now()}.txt`;
const body = `BT-0-R2-01 verification ${new Date().toISOString()}`;
const expectedHash = crypto.createHash("sha256").update(body).digest("hex");

async function main() {
  console.log("PUT", key);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));

  console.log("GET", key);
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const c of got.Body) chunks.push(c);
  const downloaded = Buffer.concat(chunks).toString("utf8");

  const downloadedHash = crypto.createHash("sha256").update(downloaded).digest("hex");
  if (downloadedHash !== expectedHash) {
    console.error("FAIL: sha256 mismatch");
    process.exit(1);
  }

  console.log("DELETE", key);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  console.log("PASS: R2 upload + download + delete + sha256 match");
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
