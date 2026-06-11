import { NextResponse } from "next/server";
import { fetchDisplayBoard } from "@/lib/courts/aphc-displayboard";
import { fetchSciDisplayBoard } from "@/lib/courts/sci-displayboard";

/**
 * Live court display boards (AP High Court + Supreme Court), proxied
 * for the dashboard panel. Both upstreams refresh every ~60s; cache for
 * 55s at the edge so polling panels never hammer the court servers.
 * Each board fails independently — one being down doesn't blank the
 * other.
 */

export const dynamic = "force-dynamic";
// NIC-hosted court sites are slow-to-hostile toward non-Indian IPs:
// wdb.sci.gov.in times out from Vercel's default iad1 region while
// responding instantly from India. Pin this function to Mumbai.
export const preferredRegion = "bom1";

export async function GET() {
  const [aphc, sci] = await Promise.allSettled([
    fetchDisplayBoard(),
    fetchSciDisplayBoard(),
  ]);

  const aphcRows = aphc.status === "fulfilled" ? aphc.value : [];
  const sciRows = sci.status === "fulfilled" ? sci.value : [];

  if (aphc.status === "rejected" && sci.status === "rejected") {
    return NextResponse.json(
      {
        error: `both boards unavailable: ${String(aphc.reason)} | ${String(sci.reason)}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      aphc: {
        rows: aphcRows,
        error: aphc.status === "rejected" ? String(aphc.reason) : null,
      },
      sci: {
        rows: sciRows,
        error: sci.status === "rejected" ? String(sci.reason) : null,
      },
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "s-maxage=55, stale-while-revalidate=30",
      },
    },
  );
}
