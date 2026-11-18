import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { env } from '../env';
import { log } from '../job';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hapus semua file media milik workspace (dipanggil setelah akun dihapus, UU PDP). Idempotent. */
export async function purgeWorkspaceMedia(workspaceId: string): Promise<void> {
  if (!UUID.test(workspaceId)) throw new Error('workspaceId tidak valid');
  if (env.STORAGE_DRIVER === 'local') {
    await rm(join(resolve(env.LOCAL_MEDIA_DIR), workspaceId), { recursive: true, force: true });
  } else {
    const s3 = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' },
    });
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: env.S3_BUCKET, Prefix: `${workspaceId}/`, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: env.S3_BUCKET, Delete: { Objects: keys } }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
  log('media workspace dihapus', { workspaceId });
}
