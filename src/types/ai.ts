// AI Enhancement Types that match Rust structures

export interface AISettings {
  enabled: boolean;
  provider: string;
  model: string;
  hasApiKey: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

// ---- Prompt library (replaces legacy EnhancementOptions/CustomPrompts) ----

export type PromptKind = 'builtin' | 'custom';

export type BuiltinId = 'default' | 'prompts' | 'email' | 'commit';

/** One entry in the prompt library — built-in (with overrides) or user-created. */
export interface Prompt {
  id: string;
  kind: PromptKind;
  /** Present iff `kind === 'builtin'`. Stable enum tag for transform routing. */
  builtin_id?: BuiltinId;
  name: string;
  icon: string;
  prompt_text: string;
}

/** Persistent prompt library blob (single tauri-plugin-store key `prompts`). */
export interface PromptLibrary {
  version: number;
  active_prompt_id: string;
  prompts: Prompt[];
}
