// AI Enhancement Types that match Rust structures

/**
 * @deprecated Use `Prompt` + `PromptLibrary`. Removal target: release after the
 * one shipping the Prompts tab restructure.
 */
export type EnhancementPreset = 'Default' | 'Prompts' | 'Email' | 'Commit';

/**
 * @deprecated Use `PromptLibrary.active_prompt_id`.
 */
export interface EnhancementOptions {
  preset: EnhancementPreset;
  custom_vocabulary: string[];
}

export interface AISettings {
  enabled: boolean;
  provider: string;
  model: string;
  hasApiKey: boolean;
  /** @deprecated read `active_prompt_id` from the prompt library instead. */
  enhancement_options?: EnhancementOptions;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

/**
 * @deprecated Use the `Prompt` library. Removal target: release after the one
 * shipping the Prompts tab restructure.
 */
export const toBackendOptions = (options: {
  preset: EnhancementPreset;
  customVocabulary: string[];
}): EnhancementOptions => ({
  preset: options.preset,
  custom_vocabulary: options.customVocabulary,
});

/**
 * @deprecated Use the `Prompt` library.
 */
export const fromBackendOptions = (options: EnhancementOptions): {
  preset: EnhancementPreset;
  customVocabulary: string[];
} => ({
  preset: options.preset,
  customVocabulary: options.custom_vocabulary,
});

/**
 * @deprecated Replaced by per-`Prompt` `prompt_text`. Removal target: next release.
 */
export interface CustomPrompts {
  base: string | null;
  prompts: string | null;
  email: string | null;
  commit: string | null;
}

// ---- Prompt library (new, replaces EnhancementOptions/CustomPrompts) ----

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