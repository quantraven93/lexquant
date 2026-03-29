import { NextResponse } from "next/server";

const DC_BASE = "https://services.ecourts.gov.in/ecourtindia_v6";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
  "Content-Type": "application/x-www-form-urlencoded",
  "X-Requested-With": "XMLHttpRequest",
};

// Cache sessions and data
let dcCookies = "";
let dcCookiesTime = 0;

async function getDCSession(): Promise<string> {
  if (dcCookies && Date.now() - dcCookiesTime < 300000) return dcCookies; // 5 min cache
  const res = await fetch(`${DC_BASE}/?p=casestatus/index`, {
    headers: { "User-Agent": HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(10000),
  });
  dcCookies = (res.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).filter(Boolean).join("; ");
  dcCookiesTime = Date.now();
  return dcCookies;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const stateCode = searchParams.get("state_code");
  const distCode = searchParams.get("dist_code");

  try {
    const cookies = await getDCSession();

    if (action === "districts" && stateCode) {
      const res = await fetch(`${DC_BASE}/?p=casestatus/fillDistrict`, {
        method: "POST", headers: { ...HEADERS, Cookie: cookies },
        body: `state_code=${stateCode}&ajax_req=true&app_token=`,
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      const html = data.dist_list || "";
      const options = [...html.matchAll(/value=(\d+)\s*>([^<]+)/g)].map(m => ({
        value: m[1], label: m[2].trim(),
      }));
      return NextResponse.json({ districts: options });
    }

    if (action === "complexes" && stateCode && distCode) {
      const res = await fetch(`${DC_BASE}/?p=casestatus/fillcomplex`, {
        method: "POST", headers: { ...HEADERS, Cookie: cookies },
        body: `state_code=${stateCode}&dist_code=${distCode}&ajax_req=true&app_token=`,
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      const html = data.complex_list || "";
      const options = [...html.matchAll(/value=([^@\s]+@[^@\s]+@[^\s>]+)\s*>([^<]+)/g)].map(m => ({
        value: m[1], label: m[2].trim(),
      }));
      return NextResponse.json({ complexes: options });
    }

    return NextResponse.json({ error: "Invalid action. Use ?action=districts&state_code=X or ?action=complexes&state_code=X&dist_code=Y" }, { status: 400 });
  } catch (error) {
    console.error("[Courts API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch court data" }, { status: 500 });
  }
}
