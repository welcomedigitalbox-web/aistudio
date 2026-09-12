import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Hand the browser a one-off URL it can PUT an image to.
 *
 * R2 has no public write, and routing the bytes through a function would cap
 * them at a few megabytes. A presigned URL costs nothing and expires.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { refId, contentType } = await req.json();
  if (!refId) return NextResponse.json({ error: "refId is required." }, { status: 400 });

  if (!/^image\/(png|jpeg|webp)$/.test(contentType ?? "")) {
    return NextResponse.json(
      { error: "Upload a PNG, JPEG or WebP image." },
      { status: 400 }
    );
  }

  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `refs/uploads/${refId}/${crypto.randomUUID()}.${ext}`;

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 }
  );

  return NextResponse.json({ url, key });
}
