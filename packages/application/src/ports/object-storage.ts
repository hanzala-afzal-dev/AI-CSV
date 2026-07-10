export interface PresignedUploadRequest {
  readonly ownerId: string;
  readonly datasetId: string;
  readonly filename: string;
  readonly uploadIntentId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly expiresInSeconds: number;
}

export interface PresignedUpload {
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface StoredObjectMetadata {
  readonly sizeBytes: number;
  readonly contentType: string | null;
  readonly checksumSha256: string | null;
  readonly ownerId: string | null;
  readonly datasetId: string | null;
}

export interface ObjectStorage {
  isReady(): Promise<boolean>;
  createObjectKey(input: {
    ownerId: string;
    datasetId: string;
    uploadIntentId: string;
    filename: string;
  }): string;
  createPresignedUpload(request: PresignedUploadRequest): Promise<PresignedUpload>;
  inspectObject(objectKey: string): Promise<StoredObjectMetadata>;
}
