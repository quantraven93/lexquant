/**
 * Shared core of the two case-refresh pipelines:
 *   - scripts/update-cases.ts              (GitHub Action)
 *   - src/app/api/cron/update-cases/route.ts (Vercel cron)
 *
 * They previously carried separate copies of the change-detection rules and
 * had drifted apart: the script detected judge changes the route missed, and
 * the route skipped the "Unknown" seed status the script alerted on.
 *
 * Every rule here is deliberately conservative. An alert fires only on a
 * value the scraper actually read off the court page; a blank or unparsed
 * field means "we did not read it", never "it changed to nothing".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseStatus } from "./types";

/**
 * Seed status written by the create-case route (src/app/api/cases/route.ts)
 * before any successful fetch. It is a placeholder, not a prior status.
 */
const PLACEHOLDER_STATUS = "Unknown";

/** Success-signal column added by migration 012; may be absent in prod. */
export const LAST_FETCH_OK_COLUMN = "last_fetch_ok";

/** The `cases` columns change detection reads. */
export interface TrackedCaseFields {
  current_status: string | null;
  next_hearing_date: string | null;
  last_order_date: string | null;
  judges: string | null;
}

export interface CaseChange {
  /** `cases` column the change belongs to; stored as case_updates.field_name */
  field: string;
  /** case_updates.update_type — values are constrained by the table CHECK */
  type: "status_change" | "hearing_date_change" | "new_order" | "judge_change";
  oldValue: string | null;
  newValue: string;
}

/** True only for a value the scraper actually produced. */
export function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function differs(fresh: string, stored: string | null): boolean {
  return fresh.trim() !== (stored ?? "").trim();
}

/**
 * Bench strings for comparison only; the fresh value is still stored
 * verbatim. eCourts prefixes Coram with an internal court code and the two
 * refresh paths differ in punctuation and case, none of which is a change
 * of bench.
 */
function normaliseBench(value: string): string {
  return value
    .replace(/^\d+/, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Compares a freshly-scraped CaseStatus against the stored row.
 *
 * Returns only changes backed by a real scraped value. A field the scraper
 * failed to parse yields no change, so an unparsed status can never raise a
 * status_change or the notification that rides on it.
 */
export function detectCaseChanges(
  tracked: TrackedCaseFields,
  fresh: CaseStatus,
): CaseChange[] {
  const changes: CaseChange[] = [];

  // Status. Moving off the placeholder seed is a first read, not a change.
  if (
    hasValue(fresh.currentStatus) &&
    differs(fresh.currentStatus, tracked.current_status) &&
    tracked.current_status !== PLACEHOLDER_STATUS
  ) {
    changes.push({
      field: "current_status",
      type: "status_change",
      oldValue: tracked.current_status,
      newValue: fresh.currentStatus.trim(),
    });
  }

  // Next hearing date. A null prior value is a real event: a date got fixed.
  if (
    hasValue(fresh.nextHearingDate) &&
    differs(fresh.nextHearingDate, tracked.next_hearing_date)
  ) {
    changes.push({
      field: "next_hearing_date",
      type: "hearing_date_change",
      oldValue: tracked.next_hearing_date,
      newValue: fresh.nextHearingDate.trim(),
    });
  }

  // New order. A null prior value is a real event: the first order landed.
  if (
    hasValue(fresh.lastOrderDate) &&
    differs(fresh.lastOrderDate, tracked.last_order_date)
  ) {
    changes.push({
      field: "last_order_date",
      type: "new_order",
      oldValue: tracked.last_order_date,
      newValue: hasValue(fresh.lastOrderSummary)
        ? `${fresh.lastOrderDate.trim()} - ${fresh.lastOrderSummary.trim()}`
        : fresh.lastOrderDate.trim(),
    });
  }

  // Bench. Unlike a hearing date, an empty stored bench is not an event;
  // it is a field nothing ever filled in, so there is nothing to change from.
  // Compared through normaliseBench because the cron and the manual-refresh
  // button read Coram with different parsers: the same bench arrives as
  // "3521Y. LAKSHMANA RAO" from one and "Y. LAKSHMANA RAO" from the other.
  if (
    hasValue(fresh.judges) &&
    hasValue(tracked.judges) &&
    normaliseBench(fresh.judges) !== normaliseBench(tracked.judges)
  ) {
    changes.push({
      field: "judges",
      type: "judge_change",
      oldValue: tracked.judges,
      newValue: fresh.judges.trim(),
    });
  }

  return changes;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * PostgREST rejects a statement naming a column the schema cache lacks.
 * Verified against this project: a SELECT gives 42703 ("column
 * cases.last_fetch_ok does not exist"); a write gives PGRST204.
 */
export function isMissingColumnError(
  error: PostgrestLikeError | null,
  column: string,
): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    (error.message ?? "").includes(column)
  );
}

/** Mutable per-run flag so one probe serves the whole batch. */
export interface ColumnSupport {
  lastFetchOk: boolean;
}

export function newColumnSupport(): ColumnSupport {
  return { lastFetchOk: true };
}

/**
 * Writes a `cases` row, tolerating a `last_fetch_ok` column that migration
 * 012 has not yet created. PostgREST rejects the WHOLE payload when the
 * column is missing, so the first rejection drops that key and flips the
 * per-run flag; later writes in the same run skip the doomed attempt.
 *
 * Returns true when the row was written.
 */
export async function updateCaseRow(
  supabase: SupabaseClient,
  caseId: string,
  payload: Record<string, unknown>,
  support: ColumnSupport,
): Promise<boolean> {
  const wantsLastFetchOk = LAST_FETCH_OK_COLUMN in payload;

  if (!wantsLastFetchOk || support.lastFetchOk) {
    const { error } = await supabase
      .from("cases")
      .update(payload)
      .eq("id", caseId);
    if (!error) return true;
    if (
      !wantsLastFetchOk ||
      !isMissingColumnError(error, LAST_FETCH_OK_COLUMN)
    ) {
      console.error(`[CaseRefresh] Update failed for ${caseId}:`, error);
      return false;
    }
    support.lastFetchOk = false;
    console.warn(
      `[CaseRefresh] '${LAST_FETCH_OK_COLUMN}' column absent — migration 012 not applied; recording last_checked_at only`,
    );
  }

  const fallback = { ...payload };
  delete fallback[LAST_FETCH_OK_COLUMN];
  const { error } = await supabase
    .from("cases")
    .update(fallback)
    .eq("id", caseId);
  if (error) {
    console.error(`[CaseRefresh] Update failed for ${caseId}:`, error);
    return false;
  }
  return true;
}
