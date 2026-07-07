export interface PresignedUploadRequest {
  readonly ownerId: string;
  readonly datasetId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

export interface PresignedUpload {
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly expiresAt: Date;
}

export interface ObjectStorage {
  isReady(): Promise<boolean>;
  createObjectKey(input: {
    ownerId: string;
    datasetId: string;
    filename: string;
  }): string;
  createPresignedUpload(request: PresignedUploadRequest): Promise<PresignedUpload>;
}
