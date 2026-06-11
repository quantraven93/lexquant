/**
 * Minimal client for the eCourts India MCP endpoint (mcp.ecourtsindia.com).
 *
 * The service speaks MCP Streamable-HTTP: an `initialize` POST yields an
 * `Mcp-Session-Id` response header; subsequent `tools/call` POSTs carry it
 * and answer as a one-shot SSE stream (`event: message\ndata: {...}`).
 * The session id is cached module-level so warm lambdas skip the handshake;
 * a session-expiry error triggers one re-handshake retry.
 *
 * Config: ECOURTSINDIA_MCP_URL — full endpoint URL including the
 * `?token=eci_live_...` query parameter.
 */

const PROTOCOL_VERSION = "2025-03-26";
const CALL_TIMEOUT_MS = 15_000;

let cachedSessionId: string | null = null;

export interface CauselistEntry {
  id: number;
  date: string;
  caseNumber: string[];
  party: string;
  petitioners: string[];
  respondents: string[];
  advocates: string[];
  judge: string[];
  bench: string;
  listingNo: number;
  listType: string;
  courtType: string;
  courtName: string;
  district: string;
  state: string;
  courtComplexCode: string;
}

export interface CauselistSearchArgs {
  state?: string;
  q?: string;
  litigant?: string;
  advocate?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

function endpoint(): string {
  const url = process.env.ECOURTSINDIA_MCP_URL;
  if (!url) {
    throw new Error("ECOURTSINDIA_MCP_URL not set");
  }
  return url;
}

async function initialize(): Promise<string> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "lexquant", version: "1.0" },
      },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const sid = res.headers.get("mcp-session-id");
  if (!res.ok || !sid) {
    throw new Error(`eCourtsIndia initialize failed: HTTP ${res.status}`);
  }
  // The spec wants an initialized notification before tool calls.
  await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sid,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {});
  return sid;
}

/** Extract the JSON-RPC payload from a one-shot SSE body. */
function parseSse(body: string): unknown {
  for (const line of body.split("\n")) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6));
    }
  }
  // Some responses come back as plain JSON.
  return JSON.parse(body);
}

interface ToolCallResult {
  result?: { content?: Array<{ type: string; text?: string }> };
  error?: { code: number; message: string };
}

async function rawToolCall(
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`eCourtsIndia tools/call failed: HTTP ${res.status}`);
  }
  return parseSse(await res.text()) as ToolCallResult;
}

async function toolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if (!cachedSessionId) cachedSessionId = await initialize();
  let out = await rawToolCall(cachedSessionId, name, args).catch(
    (e: unknown) => ({ error: { code: -1, message: String(e) } }),
  );
  if (out.error) {
    // Session likely expired — one re-handshake retry.
    cachedSessionId = await initialize();
    out = await rawToolCall(cachedSessionId, name, args);
  }
  if (out.error) {
    throw new Error(`eCourtsIndia ${name}: ${out.error.message}`);
  }
  return out;
}

/**
 * The tool returns human-readable text plus a `<raw_json>...</raw_json>`
 * block; the structured results live inside the latter.
 */
function extractRawJson(out: ToolCallResult): unknown {
  for (const block of out.result?.content || []) {
    if (block.type !== "text" || !block.text) continue;
    const m = block.text.match(/<raw_json>\s*([\s\S]*?)\s*<\/raw_json>/);
    if (m) return JSON.parse(m[1]);
  }
  return null;
}

export async function searchCauselist(
  args: CauselistSearchArgs,
): Promise<CauselistEntry[]> {
  const out = await toolCall("search_causelist", { limit: 20, ...args });
  const raw = extractRawJson(out) as {
    data?: { results?: Array<Record<string, unknown>> };
  } | null;
  const results = raw?.data?.results || [];
  return results.map((r) => ({
    id: Number(r.id),
    date: String(r.date || "").slice(0, 10),
    caseNumber: Array.isArray(r.caseNumber) ? r.caseNumber.map(String) : [],
    party: String(r.party || ""),
    petitioners: Array.isArray(r.petitioners) ? r.petitioners.map(String) : [],
    respondents: Array.isArray(r.respondents) ? r.respondents.map(String) : [],
    advocates: Array.isArray(r.advocates) ? r.advocates.map(String) : [],
    judge: Array.isArray(r.judge) ? r.judge.map(String) : [],
    bench: String(r.bench || ""),
    listingNo: Number(r.listingNo || 0),
    listType: String(r.listType || ""),
    courtType: String(r.courtType || ""),
    courtName: String(r.courtName || ""),
    district: String(r.district || ""),
    state: String(r.state || ""),
    courtComplexCode: String(r.courtComplexCode || ""),
  }));
}

export function isCauselistConfigured(): boolean {
  return Boolean(process.env.ECOURTSINDIA_MCP_URL);
}
