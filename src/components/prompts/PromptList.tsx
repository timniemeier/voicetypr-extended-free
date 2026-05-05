import { Plus } from "lucide-react";
import type { Prompt, PromptLibrary } from "@/types/ai";
import { PromptRow } from "./PromptRow";

interface PromptListProps {
  library: PromptLibrary;
  selectedId: string | null;
  searchQuery: string;
  isCreating: boolean;
  onSelect: (id: string) => void;
  onNewPrompt: () => void;
}

function matchesQuery(prompt: Prompt, query: string): boolean {
  if (!query.trim()) return true;
  return prompt.name.toLowerCase().includes(query.toLowerCase());
}

export function PromptList({
  library,
  selectedId,
  searchQuery,
  isCreating,
  onSelect,
  onNewPrompt,
}: PromptListProps) {
  const builtins = library.prompts.filter((p) => p.kind === "builtin");
  const customs = library.prompts.filter((p) => p.kind === "custom");

  const filteredBuiltins = builtins.filter((p) => matchesQuery(p, searchQuery));
  const filteredCustoms = customs.filter((p) => matchesQuery(p, searchQuery));

  const totalMatches = filteredBuiltins.length + filteredCustoms.length;
  const showEmptyState = totalMatches === 0 && searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {showEmptyState ? (
        <div
          data-testid="prompt-list-empty"
          className="text-xs text-muted-foreground py-4 px-3"
        >
          No prompts match "{searchQuery}".
        </div>
      ) : (
        <>
          <section data-testid="prompt-group-builtin">
            <h3 className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 mb-1">
              Built-in
            </h3>
            <div className="flex flex-col gap-0.5">
              {filteredBuiltins.map((prompt) => (
                <PromptRow
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === library.active_prompt_id}
                  isSelected={!isCreating && prompt.id === selectedId}
                  onClick={() => onSelect(prompt.id)}
                />
              ))}
            </div>
          </section>

          <section data-testid="prompt-group-custom">
            <h3 className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 mb-1">
              Custom
            </h3>
            <div className="flex flex-col gap-0.5">
              {filteredCustoms.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-1">
                  No custom prompts yet.
                </p>
              ) : (
                filteredCustoms.map((prompt) => (
                  <PromptRow
                    key={prompt.id}
                    prompt={prompt}
                    isActive={prompt.id === library.active_prompt_id}
                    isSelected={!isCreating && prompt.id === selectedId}
                    onClick={() => onSelect(prompt.id)}
                  />
                ))
              )}
            </div>
          </section>
        </>
      )}

      <button
        type="button"
        onClick={onNewPrompt}
        data-testid="prompt-new"
        data-selected={isCreating ? "true" : "false"}
        className={
          "mt-1 flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-sm hover:bg-accent/50 transition-colors " +
          (isCreating ? "bg-accent text-accent-foreground" : "")
        }
      >
        <Plus className="h-4 w-4" />
        New prompt
      </button>
    </div>
  );
}
