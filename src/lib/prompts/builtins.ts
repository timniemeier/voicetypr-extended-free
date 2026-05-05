import type { BuiltinId } from "@/types/ai";
import type { IconName } from "@/lib/prompts/icon-allowlist";

/**
 * Frontend-side mirror of built-in name + icon defaults. Used for optimistic
 * UI on the "Reset to default" action before the backend round-trip resolves.
 *
 * Note: `prompt_text` is intentionally NOT mirrored here — it lives in Rust
 * (`BUILTIN_PROMPT_DEFAULTS` in `src-tauri/src/ai/prompts.rs`) so the UI never
 * carries a stale copy across upgrades. The backend's `reset_prompt_to_default`
 * is the source of truth for the text.
 */
export const BUILTIN_DEFAULTS_UI: Record<
  BuiltinId,
  { name: string; icon: IconName }
> = {
  default: { name: "Default", icon: "FileText" },
  prompts: { name: "Prompts", icon: "Sparkles" },
  email: { name: "Email", icon: "Mail" },
  commit: { name: "Commit", icon: "GitCommit" },
};
