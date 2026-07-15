import { CreateDatasetCommandHandler } from "@agentic-csv/application";
import {
  createDatasetRequestSchema,
  datasetListQuerySchema
} from "@agentic-csv/contracts";
import { datasetResponse, safeDataset } from "@/server/dataset-http";
import {
  authenticateBrowserRequest,
  authorizeMutation,
  errorResponse,
  protectDatasetUpload,
  readJson,
  type RequestContext
} from "@/server/http";
import { getRuntime } from "@/server/runtime";

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof authenticateBrowserRequest>> | undefined;
  try {
    context = await authenticateBrowserRequest(request);
    const url = new URL(request.url);
    const query = datasetListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries())
    );
    const runtime = getRuntime();
    const datasets = await runtime.datasetService.list(
      context.session.userId,
      query.limit
    );
    return datasetResponse(
      {
        datasets: datasets.map(safeDataset),
        limits: {
          maxBytes: runtime.env.UPLOAD_MAX_BYTES,
          maxRows: runtime.env.CSV_MAX_ROWS,
          maxColumns: runtime.env.CSV_MAX_COLUMNS,
          maxFieldCharacters: runtime.env.CSV_MAX_FIELD_CHARACTERS
        }
      },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}

export async function POST(request: Request) {
  let context: RequestContext | undefined;
  try {
    context = await authorizeMutation(request);
    const uploadHeaders = await protectDatasetUpload(
      request,
      context.principal.userId,
      "create"
    );
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

    return datasetResponse(
      {
        dataset: safeDataset({
          id: result.datasetId,
          name: result.name,
          originalFilename: result.originalFilename,
          status: result.status,
          rowCount: null,
          columnCount: null,
          activeVersion: null,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt
        })
      },
      context.correlationId,
      201,
      { ...context.responseHeaders, ...uploadHeaders }
    );
  } catch (error) {
    return errorResponse(error, context?.correlationId);
  }
}
