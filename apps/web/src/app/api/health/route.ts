import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "web",
    checkedAt: new Date().toISOString()
  });
}
