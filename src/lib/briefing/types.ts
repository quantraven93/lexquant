export type LLMProvider = "gemini" | "anthropic" | "ollama";

export interface BriefingSignals {
  tracked_cases: number;
  upcoming_hearings: number;
  fresh_judgments: number;
  fresh_news: number;
  watchlist_items: number;
}

export interface GeneratedBriefing {
  body: string;
  provider: LLMProvider;
  model: string;
  prompt_chars: number;
  output_chars: number;
  duration_ms: number;
}
