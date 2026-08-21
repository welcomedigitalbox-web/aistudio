import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function putFromUrl(key: string, sourceUrl: string, contentType?: string) {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Fetch failed for ${sourceUrl}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType ?? res.headers.get("content-type") ?? "application/octet-stream",
    })
  );
  return key;
}

export function publicUrl(key: string) {
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}
