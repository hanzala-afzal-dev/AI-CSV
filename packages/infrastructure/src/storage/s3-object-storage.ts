import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStorage,
  PresignedUpload,
  PresignedUploadRequest
} from "@agentic-csv/application";
import type { AppEnv } from "../config/env";

export function createS3Client(env: AppEnv): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    }
  });
}

export class S3ObjectStorage implements ObjectStorage {
  public constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  public async isReady(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  public async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  public createObjectKey(input: {
    ownerId: string;
    datasetId: string;
    filename: string;
  }): string {
    const safeFilename = input.filename
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 180);

    return `owners/${input.ownerId}/datasets/${input.datasetId}/${safeFilename}`;
  }

  public async createPresignedUpload(
    request: PresignedUploadRequest
  ): Promise<PresignedUpload> {
    const objectKey = this.createObjectKey(request);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: request.contentType
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: request.expiresInSeconds
    });

    return {
      objectKey,
      uploadUrl,
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000)
    };
  }
}
