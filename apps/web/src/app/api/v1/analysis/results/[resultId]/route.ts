import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateBrowserRequest, errorResponse, HttpError } from "@/server/http";
import { getRuntime } from "@/server/runtime";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly resultId: string }> }
) {
  let correlationId = crypto.randomUUID();
  try {
    const context = await authenticateBrowserRequest(request);
    correlationId = context.correlationId;
    const resultId = idSchema.parse((await params).resultId);
    const artifact = await getRuntime().analysisRepository.getArtifact(
      context.session.userId,
      resultId
    );
    if (!artifact) {
      throw new HttpError(
        404,
        "ANALYSIS_RESULT_NOT_FOUND",
        "Analysis result was not found."
      );
    }
    return NextResponse.json(
      { ok: true, data: { artifact }, correlationId: context.correlationId },
      { status: 200, headers: context.responseHeaders }
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
