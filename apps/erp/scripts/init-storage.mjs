import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
export async function initStorage() {
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
  try {
    for (const logical of ['candidate-documents', 'automation-documents']) {
      const Bucket = `${process.env.S3_BUCKET_PREFIX || 'erp'}-${logical}`;
      try { await client.send(new HeadBucketCommand({ Bucket })); }
      catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; await client.send(new CreateBucketCommand({ Bucket })); }
    }
  } finally { client.destroy(); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await initStorage();
