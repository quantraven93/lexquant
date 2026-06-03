import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "order-pdfs";

/**
 * Order PDFs from HC eCourts are session-bound (the display_pdf link only
 * serves a real PDF to the session that generated it), so we fetch them at
 * refresh time and store them here. SC orders keep their direct public URLs.
 * The bucket is private; serving goes through short-lived signed URLs.
 */

/** Upload an order PDF; returns the storage path. Admin client = bypasses
 *  storage RLS so it works from server routes against the private bucket. */
export async function uploadOrderPdf(
  caseId: string,
  index: number,
  bytes: Uint8Array,
): Promise<string> {
  const path = `${caseId}/${index}.pdf`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return path;
}

/** Download a stored order PDF as bytes (for AI text extraction). */
export async function downloadOrderPdf(path: string): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message ?? "no data"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/** Short-lived signed URL for streaming a stored order PDF to the browser. */
export async function signOrderPdf(
  path: string,
  expiresIn = 120,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  return error ? null : (data?.signedUrl ?? null);
}
