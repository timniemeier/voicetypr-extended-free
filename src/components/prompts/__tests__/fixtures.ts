import type { Prompt, PromptLibrary } from "@/types/ai";

export const fixtureBuiltins: Prompt[] = [
  {
    id: "builtin:default",
    kind: "builtin",
    builtin_id: "default",
    name: "Default",
    icon: "FileText",
    prompt_text: "DEFAULT_TEXT",
  },
  {
    id: "builtin:prompts",
    kind: "builtin",
    builtin_id: "prompts",
    name: "Prompts",
    icon: "Sparkles",
    prompt_text: "PROMPTS_TEXT",
  },
  {
    id: "builtin:email",
    kind: "builtin",
    builtin_id: "email",
    name: "Email",
    icon: "Mail",
    prompt_text: "EMAIL_TEXT",
  },
  {
    id: "builtin:commit",
    kind: "builtin",
    builtin_id: "commit",
    name: "Commit",
    icon: "GitCommit",
    prompt_text: "COMMIT_TEXT",
  },
];

export function makeLibrary(
  overrides: Partial<PromptLibrary> = {}
): PromptLibrary {
  return {
    version: 1,
    active_prompt_id: "builtin:default",
    prompts: [...fixtureBuiltins],
    ...overrides,
  };
}
