import { z } from "zod";
import { datasetResponse, safeDatasetProfile } from "@/server/dataset-http";
import { authenticateBrowserRequest, errorResponse } from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  {
    params
  }: {
    readonly params: Promise<{
      readonly datasetId: string;
      readonly versionId: string;
    }>;
  }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const values = await params;
    const datasetId = idSchema.parse(values.datasetId);
    const versionId = idSchema.parse(values.versionId);
    const profile = await getRuntime().datasetService.getProfile(
      context.session.userId,
      datasetId,
      versionId
    );
    return datasetResponse(
      safeDatasetProfile(profile),
      context.correlationId,
      200,
      context.responseHeaders
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
