import { createElement } from "react";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types/ai";
import { resolveIcon } from "@/lib/prompts/icon-allowlist";

interface PromptRowProps {
  prompt: Prompt;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function PromptRow({ prompt, isActive, isSelected, onClick }: PromptRowProps) {
  const normalized = prompt.prompt_text.replace(/\s+/g, " ").trim();
  const preview =
    normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`prompt-row-${prompt.id}`}
      data-active={isActive ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md flex items-start gap-2 transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent text-accent-foreground"
      )}
    >
      {createElement(resolveIcon(prompt.icon), {
        className: "h-4 w-4 mt-0.5 shrink-0 text-muted-foreground",
      })}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{prompt.name}</span>
          {isActive && (
            <span
              data-testid={`active-dot-${prompt.id}`}
              aria-label="Active"
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
            />
          )}
          <span
            className={cn(
              "ml-auto text-[10px] uppercase tracking-wide font-medium",
              "text-muted-foreground"
            )}
          >
            {prompt.kind === "builtin" ? "default" : "custom"}
          </span>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
        )}
      </div>
    </button>
  );
}
