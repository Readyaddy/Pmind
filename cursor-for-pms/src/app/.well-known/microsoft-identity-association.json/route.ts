import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      associatedApplications: [
        { applicationId: "81d489b7-b1ab-4b74-ba4d-906e2511f1ad" },
      ],
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
