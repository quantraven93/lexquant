/**
 * Cron endpoint: Fetches live status for all tracked cases,
 * detects changes, creates case_update records, and sends notifications.
 *
 * Called by:
 * - Vercel Cron (daily at 03:00 UTC) via vercel.json
 * - Manual trigger via POST with CRON_SECRET
 *
 * Change detection and the column-tolerant row write live in
 * @/lib/courts/case-refresh, shared with scripts/update-cases.ts.
 *
 * Security: Requires CRON_SECRET in Authorization header.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { courtService } from "@/lib/courts/court-service";
import {
  detectCaseChanges,
  hasValue,
  newColumnSupport,
  updateCaseRow,
  type TrackedCaseFields,
} from "@/lib/courts/case-refresh";
import { notifyCaseUpdate } from "@/lib/notifications/notify";
import { NextResponse } from "next/server";
import type { CaseIdentifier } from "@/lib/courts/types";

export const maxDuration = 60; // Vercel Hobby allows up to 60s

/** Stop pulling new cases with 5s of the 60s function limit left. */
const TIME_BUDGET_MS = 55_000;

export async function GET(request: Request) {
  // Verify cron secret — Vercel Cron sends it as Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runCaseUpdates();
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runCaseUpdates();
}

async function runCaseUpdates() {
  const startTime = Date.now();
  const supabase = createAdminClient();

  console.log("[Cron] Starting case update job...");

  // Fetch all active cases (across all users)
  const { data: cases, error } = await supabase
    .from("cases")
    .select("*")
    .eq("is_active", true)
    .order("last_checked_at", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("[Cron] Failed to fetch cases:", error);
    return NextResponse.json(
      { error: "Failed to fetch cases" },
      { status: 500 },
    );
  }

  if (!cases || cases.length === 0) {
    console.log("[Cron] No active cases to update");
    return NextResponse.json({
      success: true,
      casesChecked: 0,
      updatesFound: 0,
      duration: Date.now() - startTime,
    });
  }

  console.log(`[Cron] Found ${cases.length} active cases to check`);

  let casesChecked = 0;
  let fetchOk = 0;
  let fetchFailed = 0;
  let updatesFound = 0;
  let errorCount = 0;
  const columnSupport = newColumnSupport();

  // Where the time budget cut the batch short, if it did. The case query is
  // ordered by last_checked_at ascending, so the untouched tail is what the
  // next run picks up first.
  let stoppedEarly: {
    afterCases: number;
    remaining: number;
    resumesAt: string | null;
  } | null = null;

  for (let index = 0; index < cases.length; index++) {
    const caseRow = cases[index];

    if (Date.now() - startTime > TIME_BUDGET_MS) {
      stoppedEarly = {
        afterCases: index,
        remaining: cases.length - index,
        resumesAt: caseRow.case_title ?? caseRow.id,
      };
      console.warn(
        `[Cron] Time budget hit after ${index}/${cases.length} cases; ${stoppedEarly.remaining} unchecked, next run resumes at "${stoppedEarly.resumesAt}"`,
      );
      break;
    }

    try {
      const identifier: CaseIdentifier = {
        courtType: caseRow.court_type,
        caseType: caseRow.case_type || "",
        caseTypeCode: caseRow.case_type_code,
        caseNumber: caseRow.case_number || "",
        caseYear: caseRow.case_year || "",
        cnrNumber: caseRow.cnr_number,
        courtCode: caseRow.court_code,
        stateCode: caseRow.state_code,
        districtCode: caseRow.district_code,
      };

      console.log(
        `[Cron] Checking case: ${caseRow.case_title} (${caseRow.court_type})`,
      );

      const newStatus = await courtService.getCaseStatus(identifier);

      const now = new Date().toISOString();

      if (!newStatus) {
        console.warn(
          `[Cron] Could not fetch status for: ${caseRow.case_title}`,
        );
        // Touch last_checked_at so we don't keep retrying immediately, but
        // NOT last_fetch_ok — a failed fetch must not look like a good read.
        await supabase
          .from("cases")
          .update({ last_checked_at: now })
          .eq("id", caseRow.id);
        casesChecked++;
        fetchFailed++;
        continue;
      }

      const changes = detectCaseChanges(
        caseRow as TrackedCaseFields,
        newStatus,
      );

      // Write only what this fetch actually produced. An omitted column keeps
      // its stored value, so a partial parse can no longer blank a field an
      // earlier good read filled in.
      const caseUpdate: Record<string, unknown> = {
        last_checked_at: now,
        last_fetch_ok: now,
      };
      if (hasValue(newStatus.currentStatus))
        caseUpdate.current_status = newStatus.currentStatus.trim();
      if (hasValue(newStatus.nextHearingDate))
        caseUpdate.next_hearing_date = newStatus.nextHearingDate.trim();
      if (hasValue(newStatus.lastOrderDate))
        caseUpdate.last_order_date = newStatus.lastOrderDate.trim();
      if (hasValue(newStatus.lastOrderSummary))
        caseUpdate.last_order_summary = newStatus.lastOrderSummary.trim();
      if (hasValue(newStatus.petitioner))
        caseUpdate.petitioner = newStatus.petitioner.trim();
      if (hasValue(newStatus.respondent))
        caseUpdate.respondent = newStatus.respondent.trim();
      if (hasValue(newStatus.judges))
        caseUpdate.judges = newStatus.judges.trim();
      // The manual-refresh route stores parsed hearings/orders under
      // raw_data; this fetch usually carries only sourceHtml, so merge
      // instead of replacing or the cron wipes listings it never read.
      if (newStatus.rawData)
        caseUpdate.raw_data = {
          ...(caseRow.raw_data ?? {}),
          ...newStatus.rawData,
        };
      if (changes.length > 0) caseUpdate.last_changed_at = now;

      await updateCaseRow(supabase, caseRow.id, caseUpdate, columnSupport);

      // Process changes: create update records and send notifications
      for (const change of changes) {
        updatesFound++;

        // Insert case_update record
        await supabase.from("case_updates").insert({
          case_id: caseRow.id,
          update_type: change.type,
          field_name: change.field,
          old_value: change.oldValue,
          new_value: change.newValue,
          details: { source: "cron_update" },
        });

        // Send notification
        await notifyCaseUpdate({
          userId: caseRow.user_id,
          caseId: caseRow.id,
          caseTitle: caseRow.case_title,
          courtName: caseRow.court_name,
          updateType: change.type,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });

        console.log(
          `[Cron] Change detected: ${caseRow.case_title} - ${change.type}: ${change.oldValue} -> ${change.newValue}`,
        );
      }

      casesChecked++;
      fetchOk++;

      // Small delay between cases to be respectful to court servers
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      errorCount++;
      console.error(`[Cron] Error updating case ${caseRow.case_title}:`, err);
    }
  }

  // Check for upcoming hearings (within 24 hours) and send reminders
  const tomorrow = new Date();
  tomorrow.setHours(tomorrow.getHours() + 24);
  const today = new Date();

  const { data: upcomingCases } = await supabase
    .from("cases")
    .select("*")
    .eq("is_active", true)
    .gte("next_hearing_date", today.toISOString().split("T")[0])
    .lte("next_hearing_date", tomorrow.toISOString().split("T")[0]);

  if (upcomingCases && upcomingCases.length > 0) {
    console.log(
      `[Cron] ${upcomingCases.length} cases have hearings in next 24h`,
    );

    for (const c of upcomingCases) {
      await notifyCaseUpdate({
        userId: c.user_id,
        caseId: c.id,
        caseTitle: c.case_title,
        courtName: c.court_name,
        updateType: "hearing_reminder",
        oldValue: null,
        newValue: `Hearing scheduled for ${c.next_hearing_date}`,
      });
    }
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Cron] Done: ${casesChecked}/${cases.length} cases checked (${fetchOk} parsed, ${fetchFailed} fetch failures), ${updatesFound} updates found, ${errorCount} errors, ${duration}ms`,
  );

  // `success` reports that the job ran, not that the sources answered — the
  // fetchOk / fetchFailed split is what says whether any real data came back.
  return NextResponse.json({
    success: true,
    casesTotal: cases.length,
    casesChecked,
    fetchOk,
    fetchFailed,
    updatesFound,
    errorCount,
    stoppedEarly,
    lastFetchOkRecorded: columnSupport.lastFetchOk,
    duration,
  });
}
