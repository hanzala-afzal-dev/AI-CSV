import { InitiateDatasetUploadHandler } from "@agentic-csv/application";
import { initiateDatasetUploadRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeMutation,
  errorResponse,
  readJson,
  successResponse,
  type RequestContext
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ readonly datasetId: string }> }
) {
  let context: RequestContext | undefined;
  try {
    context = await authorizeMutation(request);
    const runtime = getRuntime();
    const handler = new InitiateDatasetUploadHandler(
      runtime.unitOfWork,
      runtime.objectStorage,
      runtime.env.UPLOAD_MAX_BYTES,
      runtime.env.PRESIGNED_URL_TTL_SECONDS
    );
    const { datasetId } = await params;
    const body = initiateDatasetUploadRequestSchema.parse(await readJson(request));
    const result = await handler.execute({
      ownerId: context.principal.ownerId,
      datasetId,
      ...body
    });
    return successResponse(
      {
        uploadIntentId: result.uploadIntentId,
        objectKey: result.objectKey,
        uploadUrl: result.uploadUrl,
        method: result.method,
        requiredHeaders: result.requiredHeaders,
        expiresAt: result.expiresAt.toISOString()
      },
      context,
      201
    );
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}
