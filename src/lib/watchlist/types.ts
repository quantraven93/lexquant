export type WatchlistSourceType = "judgment" | "news" | "case" | "url";

export interface WatchlistItem {
  id: string;
  user_id: string;
  label: string;
  url: string;
  note: string;
  source_type: WatchlistSourceType | null;
  source_ref: string | null;
  added_at: string;
}

export interface WatchlistAddInput {
  label: string;
  url: string;
  note?: string;
  source_type?: WatchlistSourceType;
  source_ref?: string;
}
