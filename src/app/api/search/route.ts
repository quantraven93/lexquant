import { createClient } from "@/lib/supabase/server";
import { courtService } from "@/lib/courts/court-service";
import { NextResponse } from "next/server";
import type { CourtType } from "@/lib/courts/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";
  const courtType = searchParams.get("court_type") as CourtType | null;
  const stateCode = searchParams.get("state_code");
  const year = searchParams.get("year");
  const searchType = searchParams.get("type") || "party";
  const caseType = searchParams.get("case_type");

  if (!query || query.length < 1) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    switch (searchType) {
      case "party": {
        if (query.length < 3) return NextResponse.json({ error: "Min 3 chars for party search" }, { status: 400 });
        const results = await courtService.searchByPartyName({
          partyName: query,
          courtType: courtType || undefined,
          stateCode: stateCode || undefined,
          year: year || undefined,
        });
        return NextResponse.json({ results });
      }

      case "case_number": {
        // For case number search, try to look up the case directly
        const identifier = {
          courtType: (courtType || "DC") as CourtType,
          caseType: caseType || "",
          caseNumber: query,
          caseYear: year || "",
          stateCode: stateCode || undefined,
        };
        console.log("[Search] Case number lookup:", identifier);
        const caseStatus = await courtService.getCaseStatus(identifier);
        if (caseStatus) {
          return NextResponse.json({
            results: [{
              caseTitle: caseStatus.caseTitle,
              caseNumber: query,
              caseYear: year || "",
              caseType: caseType || "",
              courtType: courtType || "DC",
              courtName: courtType === "SC" ? "Supreme Court" : courtType === "HC" ? "High Court" : "District Court",
              status: caseStatus.currentStatus,
              petitioner: caseStatus.petitioner,
              respondent: caseStatus.respondent,
            }],
          });
        }
        return NextResponse.json({ results: [] });
      }

      case "advocate": {
        if (query.length < 3) return NextResponse.json({ error: "Min 3 chars for advocate search" }, { status: 400 });
        // Advocate search — use party name search as fallback for now
        // TODO: Wire HC qs_civil_advocate.php endpoint
        const results = await courtService.searchByPartyName({
          partyName: query,
          courtType: courtType || undefined,
          stateCode: stateCode || undefined,
          year: year || undefined,
        });
        return NextResponse.json({ results, note: "Advocate search uses party name as fallback" });
      }

      case "cnr": {
        if (query.length < 10) return NextResponse.json({ error: "CNR must be at least 10 chars" }, { status: 400 });
        // CNR lookup
        const identifier = {
          courtType: (courtType || "DC") as CourtType,
          caseType: "",
          caseNumber: "",
          caseYear: "",
          cnrNumber: query.toUpperCase(),
        };
        const caseStatus = await courtService.getCaseStatus(identifier);
        if (caseStatus) {
          return NextResponse.json({
            results: [{
              caseTitle: caseStatus.caseTitle,
              caseNumber: query,
              caseYear: "",
              caseType: "",
              courtType: courtType || "DC",
              courtName: "eCourts",
              cnrNumber: query.toUpperCase(),
              status: caseStatus.currentStatus,
              petitioner: caseStatus.petitioner,
              respondent: caseStatus.respondent,
            }],
          });
        }
        return NextResponse.json({ results: [] });
      }

      default:
        return NextResponse.json({ error: "Invalid search type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
