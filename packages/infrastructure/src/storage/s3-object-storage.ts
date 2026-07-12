import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStorage,
  PresignedUpload,
  PresignedUploadRequest,
  StoredObjectMetadata
} from "@agentic-csv/application";
import type { AppEnv } from "../config/env";

export function createS3Client(env: AppEnv, endpoint = env.S3_ENDPOINT): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
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
    private readonly bucket: string,
    private readonly presignClient: S3Client = client
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
    userId: string;
    datasetId: string;
    datasetVersionId: string;
    uploadIntentId: string;
    filename: string;
  }): string {
    const userId = requireUuidPathSegment(input.userId, "userId");
    const datasetId = requireUuidPathSegment(input.datasetId, "datasetId");
    const datasetVersionId = requireUuidPathSegment(
      input.datasetVersionId,
      "datasetVersionId"
    );
    const uploadIntentId = requireUuidPathSegment(input.uploadIntentId, "uploadIntentId");
    return `users/${userId}/datasets/${datasetId}/versions/${datasetVersionId}/original.csv`;
  }

  public async createPresignedUpload(
    request: PresignedUploadRequest
  ): Promise<PresignedUpload> {
    const objectKey = this.createObjectKey(request);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: request.contentType,
      ContentLength: request.sizeBytes,
      ChecksumSHA256: request.checksumSha256,
      Metadata: {
        "user-id": request.userId,
        "dataset-id": request.datasetId,
        "dataset-version-id": request.datasetVersionId,
        "upload-intent-id": request.uploadIntentId
      }
    });
    const uploadUrl = await getSignedUrl(this.presignClient, command, {
      expiresIn: request.expiresInSeconds
    });

    return {
      objectKey,
      uploadUrl,
      requiredHeaders: {
        "content-type": request.contentType,
        "x-amz-checksum-sha256": request.checksumSha256,
        "x-amz-meta-user-id": request.userId,
        "x-amz-meta-dataset-id": request.datasetId,
        "x-amz-meta-dataset-version-id": request.datasetVersionId,
        "x-amz-meta-upload-intent-id": request.uploadIntentId
      },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000)
    };
  }

  public async inspectObject(objectKey: string): Promise<StoredObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ChecksumMode: "ENABLED"
      })
    );

    return {
      sizeBytes: response.ContentLength ?? -1,
      contentType: response.ContentType ?? null,
      checksumSha256: response.ChecksumSHA256 ?? null,
      userId: response.Metadata?.["user-id"] ?? null,
      datasetId: response.Metadata?.["dataset-id"] ?? null,
      datasetVersionId: response.Metadata?.["dataset-version-id"] ?? null
    };
  }
}

function requireUuidPathSegment(value: string, field: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new Error(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}
