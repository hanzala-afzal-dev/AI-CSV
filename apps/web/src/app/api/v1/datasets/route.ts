import { CreateDatasetCommandHandler } from "@agentic-csv/application";
import { createDatasetRequestSchema } from "@agentic-csv/contracts";
import {
  authorizeMutation,
  errorResponse,
  readJson,
  successResponse,
  type RequestContext
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function POST(request: Request) {
  let context: RequestContext | undefined;
  try {
    context = await authorizeMutation(request);
    const runtime = getRuntime();
    const handler = new CreateDatasetCommandHandler(runtime.unitOfWork);
    const body = createDatasetRequestSchema.parse(await readJson(request));
    const result = await handler.execute({
      type: "dataset.create.v1",
      correlationId: context.correlationId,
      userId: context.principal.userId,
      name: body.name,
      originalFilename: body.originalFilename
    });

    return successResponse(
      {
        id: result.datasetId,
        userId: result.userId,
        name: result.name,
        originalFilename: result.originalFilename,
        objectKey: null,
        status: result.status,
        rowCount: null,
        columnCount: null,
        failureReason: null,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString()
      },
      context,
      201
    );
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}
