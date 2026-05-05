import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type ObjectMetadata = {
  size_bytes: number | null;
  content_type: string | null;
  etag: string | null;
  last_modified: string | null;
};

let warnedMissingConfig = false;

function getMissingEnvKeys() {
  const missing: string[] = [];
  if (!process.env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  return missing;
}

function loadConfig(): R2Config | null {
  const missing = getMissingEnvKeys();
  if (missing.length > 0) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(`R2 client disabled: missing env vars ${missing.join(", ")}. Document upload/download endpoints will return service_unavailable.`);
    }
    return null;
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID as string,
    accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    bucket: process.env.R2_BUCKET || "ih35-tms-evidence",
  };
}

const r2Config = loadConfig();

const r2Client =
  r2Config === null
    ? null
    : new S3Client({
        region: "auto",
        endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2Config.accessKeyId,
          secretAccessKey: r2Config.secretAccessKey,
        },
      });

function ensureConfigured() {
  if (!r2Client || !r2Config) {
    throw new Error(`r2_not_configured:${getMissingEnvKeys().join(",")}`);
  }
  return { client: r2Client, bucket: r2Config.bucket };
}

export function isR2Configured() {
  return Boolean(r2Client && r2Config);
}

export function getR2BucketName() {
  return r2Config?.bucket ?? process.env.R2_BUCKET ?? "ih35-tms-evidence";
}

export async function generatePresignedUploadUrl(r2Key: string, contentType: string, expiresInSeconds = 900) {
  const { client, bucket } = ensureConfigured();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { url, expires_in_seconds: expiresInSeconds, bucket };
}

export async function generatePresignedDownloadUrl(r2Key: string, expiresInSeconds = 300) {
  const { client, bucket } = ensureConfigured();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { url, expires_in_seconds: expiresInSeconds, bucket };
}

export async function verifyObjectExists(r2Key: string) {
  const { client, bucket } = ensureConfigured();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: r2Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function getObjectMetadata(r2Key: string): Promise<ObjectMetadata | null> {
  const { client, bucket } = ensureConfigured();
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: r2Key,
      })
    );
    return {
      size_bytes: typeof result.ContentLength === "number" ? result.ContentLength : null,
      content_type: result.ContentType ?? null,
      etag: result.ETag ?? null,
      last_modified: result.LastModified ? result.LastModified.toISOString() : null,
    };
  } catch {
    return null;
  }
}
