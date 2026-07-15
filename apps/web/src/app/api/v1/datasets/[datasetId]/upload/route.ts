import { InitiateDatasetUploadHandler } from "@agentic-csv/application";
import { initiateDatasetUploadRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeMutation,
  errorResponse,
  readJson,
  protectDatasetUpload,
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
    const uploadHeaders = await protectDatasetUpload(
      request,
      context.principal.userId,
      "intent"
    );
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
      userId: context.principal.userId,
      datasetId,
      ...body
    });
    return successResponse(
      {
        uploadIntentId: result.uploadIntentId,
        datasetVersionId: result.datasetVersionId,
        uploadUrl: result.uploadUrl,
        method: result.method,
        requiredHeaders: result.requiredHeaders,
        expiresAt: result.expiresAt.toISOString()
      },
      {
        ...context,
        responseHeaders: { ...context.responseHeaders, ...uploadHeaders }
      },
      201
    );
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}
