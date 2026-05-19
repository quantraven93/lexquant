import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Global topbar search — covers the user's own cases, ingested judgments
 * (IK), news items, and a derived list of judges. Returns a flat shape
 * grouped by category that the TopBar dropdown renders directly.
 *
 * Deliberately cheap: each branch is one Supabase query with ilike on
 * indexed columns. The dropdown debounces 200ms before calling, so we
 * are not the bottleneck.
 */

export const dynamic = "force-dynamic";

interface SearchHit {
  kind: "case" | "judgment" | "news" | "judge";
  label: string;
  sub?: string;
  href: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ groups: {} });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  // Run all four lookups in parallel.
  const [casesR, judgmentsR, newsR, judgesR] = await Promise.all([
    supabase
      .from("cases")
      .select(
        "id, case_title, case_number, case_year, case_type, court_name, current_status",
      )
      .eq("user_id", user.id)
      .or(
        `case_title.ilike.${pattern},case_number.ilike.${pattern},petitioner.ilike.${pattern},respondent.ilike.${pattern}`,
      )
      .limit(6),
    supabase
      .from("judgments")
      .select("ik_tid, title, court_name, citation, publish_date")
      .or(`title.ilike.${pattern},citation.ilike.${pattern}`)
      .order("publish_date", { ascending: false, nullsFirst: false })
      .limit(6),
    supabase
      .from("news_items")
      .select("id, title, source_name, link, published_at")
      .ilike("title", pattern)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(5),
    // judges: extract distinct authors from judgments whose author matches
    supabase
      .from("judgments")
      .select("author")
      .ilike("author", pattern)
      .not("author", "is", null)
      .limit(20),
  ]);

  const cases: SearchHit[] = (casesR.data || []).map((c) => ({
    kind: "case" as const,
    label:
      c.case_title ||
      `${c.case_type || ""} ${c.case_number}/${c.case_year || ""}`,
    sub: [
      c.case_type,
      `${c.case_number}/${c.case_year || ""}`,
      c.court_name,
      c.current_status,
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/case/${c.id}`,
  }));

  const judgments: SearchHit[] = (judgmentsR.data || []).map((j) => ({
    kind: "judgment" as const,
    label: j.title || `IK ${j.ik_tid}`,
    sub: [j.court_name, j.citation, j.publish_date].filter(Boolean).join(" · "),
    href: `/research/${j.ik_tid}`,
  }));

  const news: SearchHit[] = (newsR.data || []).map((n) => ({
    kind: "news" as const,
    label: n.title,
    sub: [n.source_name, n.published_at].filter(Boolean).join(" · "),
    href: n.link,
  }));

  // Dedup judges, cap to 5.
  const seen = new Set<string>();
  const judges: SearchHit[] = [];
  for (const row of judgesR.data || []) {
    const name = (row.author || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    judges.push({
      kind: "judge" as const,
      label: name,
      sub: "judge dossier",
      href: `/judges/${encodeURIComponent(name)}`,
    });
    if (judges.length >= 5) break;
  }

  return NextResponse.json({
    groups: {
      Cases: cases,
      Judgments: judgments,
      Judges: judges,
      News: news,
    },
  });
}
