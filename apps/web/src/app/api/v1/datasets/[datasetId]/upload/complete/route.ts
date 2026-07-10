import { CompleteDatasetUploadHandler } from "@agentic-csv/application";
import { completeDatasetUploadRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeMutation,
  errorResponse,
  hashRequestBody,
  readJson,
  requireIdempotencyKey,
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
    const handler = new CompleteDatasetUploadHandler(
      runtime.unitOfWork,
      runtime.objectStorage
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const { datasetId } = await params;
    const body = completeDatasetUploadRequestSchema.parse(await readJson(request));
    const result = await handler.execute({
      ownerId: context.principal.ownerId,
      datasetId,
      uploadIntentId: body.uploadIntentId,
      idempotencyKey,
      requestHash: hashRequestBody({ datasetId, uploadIntentId: body.uploadIntentId }),
      correlationId: context.correlationId
    });
    return successResponse(result, context);
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}
