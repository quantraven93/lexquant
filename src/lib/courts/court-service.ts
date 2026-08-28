import { scProvider } from "./sc-scraper";
import { ecourtsProvider } from "./ecourts-scraper";
import type {
  CaseIdentifier,
  CaseStatus,
  CourtType,
  SearchResult,
} from "./types";

class CourtService {
  async getCaseStatus(identifier: CaseIdentifier): Promise<CaseStatus | null> {
    // SC cases resolve through the SC scraper alone. ecourts.gov.in does not
    // carry sci.gov.in matters, so falling through to it on an SC failure
    // returned a different court's case parsed as this one.
    if (identifier.courtType === "SC") {
      try {
        const result = await scProvider.getCaseStatus(identifier);
        if (result) return result;
      } catch (error) {
        console.error("[CourtService] SC scraper failed:", error);
      }

      if (identifier.cnrNumber && scProvider.getCaseByCNR) {
        try {
          const result = await scProvider.getCaseByCNR(identifier.cnrNumber);
          if (result) return result;
        } catch (error) {
          console.error("[CourtService] SC CNR lookup failed:", error);
        }
      }

      return null;
    }

    // For HC/DC/NCLT cases, use eCourts scraper
    try {
      const result = await ecourtsProvider.getCaseStatus(identifier);
      if (result) return result;
    } catch (error) {
      console.error("[CourtService] eCourts scraper failed:", error);
    }

    // If CNR number available, try CNR lookup
    if (identifier.cnrNumber && ecourtsProvider.getCaseByCNR) {
      try {
        const result = await ecourtsProvider.getCaseByCNR(identifier.cnrNumber);
        if (result) return result;
      } catch (error) {
        console.error("[CourtService] CNR lookup failed:", error);
      }
    }

    return null;
  }

  /**
   * Search for cases by party name — OFFICIAL SOURCES ONLY.
   *
   * 1. SC scraper (sci.gov.in) — for SC or unspecified court type
   * 2. eCourts scraper (ecourts.gov.in) — for HC/DC/NCLT/CF
   *
   * No third-party sources like Indian Kanoon.
   * All CAPTCHA solving uses Claude AI Vision.
   */
  async searchByPartyName(params: {
    partyName: string;
    courtType?: CourtType;
    stateCode?: string;
    year?: string;
  }): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    // 1. SC scraper — official source (sci.gov.in)
    if (!params.courtType || params.courtType === "SC") {
      try {
        console.log(
          `[CourtService] Searching SC (sci.gov.in) for: "${params.partyName}"`,
        );
        const scResults = await scProvider.searchByPartyName(params);
        if (scResults.length > 0) {
          console.log(
            `[CourtService] SC scraper returned ${scResults.length} results`,
          );
          allResults.push(...scResults);
        } else {
          console.log("[CourtService] SC scraper returned 0 results");
        }
      } catch (error) {
        console.error("[CourtService] SC search failed:", error);
      }
    }

    // 2. eCourts scraper — official source (ecourts.gov.in)
    if (
      !params.courtType ||
      params.courtType === "HC" ||
      params.courtType === "DC" ||
      params.courtType === "NCLT" ||
      params.courtType === "CF"
    ) {
      try {
        console.log(
          `[CourtService] Searching eCourts (ecourts.gov.in) for: "${params.partyName}"`,
        );
        const ecResults = await ecourtsProvider.searchByPartyName(params);
        if (ecResults.length > 0) {
          console.log(
            `[CourtService] eCourts returned ${ecResults.length} results`,
          );
          allResults.push(...ecResults);
        } else {
          console.log("[CourtService] eCourts returned 0 results");
        }
      } catch (error) {
        console.error("[CourtService] eCourts search failed:", error);
      }
    }

    console.log(
      `[CourtService] Total results from official sources: ${allResults.length}`,
    );
    return allResults;
  }
}

export const courtService = new CourtService();
