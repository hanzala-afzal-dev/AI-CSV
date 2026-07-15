import { z } from "zod";
import { datasetResponse, safeDatasetDetail } from "@/server/dataset-http";
import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly datasetId: string }> }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const datasetId = idSchema.parse((await params).datasetId);
    const dataset = await getRuntime().datasetService.getDetail(
      context.session.userId,
      datasetId
    );
    return datasetResponse(
      { dataset: safeDatasetDetail(dataset) },
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
