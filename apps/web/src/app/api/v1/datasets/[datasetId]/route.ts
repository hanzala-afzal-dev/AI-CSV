import { z } from "zod";
import { privacyDeletionRequestSchema } from "@agentic-csv/contracts";
import { datasetResponse, safeDatasetDetail } from "@/server/dataset-http";
import {
  authenticateBrowserRequest,
  authorizeBrowserMutation,
  errorResponse,
  protectPrivacyDeletion,
  readJson
} from "@/server/http";
import { safePrivacyDeletion } from "@/server/privacy-http";
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

export async function DELETE(
  request: Request,
  { params }: { readonly params: Promise<{ readonly datasetId: string }> }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authorizeBrowserMutation(request);
    correlationId = context.correlationId;
    const datasetId = idSchema.parse((await params).datasetId);
    const body = privacyDeletionRequestSchema.parse(await readJson(request));
    const privacyHeaders = await protectPrivacyDeletion(
      request,
      context.session.userId,
      "dataset"
    );
    const runtime = getRuntime();
    await runtime.identityService.reauthenticate(
      context.session.userId,
      body.currentPassword
    );
    const deletion = await runtime.privacyDeletionService.scheduleDataset({
      userId: context.session.userId,
      datasetId,
      clientRequestId: body.clientRequestId,
      correlationId: context.correlationId
    });
    return datasetResponse(
      { deletion: safePrivacyDeletion(deletion) },
      context.correlationId,
      202,
      { ...context.responseHeaders, ...privacyHeaders }
    );
  } catch (error) {
    return errorResponse(error, correlationId, { sensitive: true });
  }
}
