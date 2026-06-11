import { NextResponse } from "next/server";
import { fetchDisplayBoard } from "@/lib/courts/aphc-displayboard";

/**
 * Live AP High Court display board, proxied for the dashboard panel.
 * The upstream JSP refreshes every 60s; cache for 55s at the edge so a
 * polling panel never hammers the court's server.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await fetchDisplayBoard();
    const inSession = rows.filter((r) => r.status !== "not_in_session");
    return NextResponse.json(
      {
        rows,
        inSession: inSession.length,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "s-maxage=55, stale-while-revalidate=30",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `display board unavailable: ${String(e)}` },
      { status: 502 },
    );
  }
}
