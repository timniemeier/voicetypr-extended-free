import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Prompt } from "@/types/ai";
import { isIconName, type IconName } from "@/lib/prompts/icon-allowlist";
import { useEffect, useRef, useState } from "react";
import { IconPicker } from "./IconPicker";

const MAX_PROMPT_TEXT_BYTES = 8192;
const MAX_NAME_CHARS = 64;
const AUTOSAVE_DEBOUNCE_MS = 500;

export interface PromptEditorPatch {
  name?: string;
  icon?: string;
  prompt_text?: string;
}

interface DraftValues {
  name: string;
  icon: IconName;
  prompt_text: string;
}

interface PromptEditorProps {
  /** `null` = create-mode (draft). Otherwise editing an existing prompt. */
  prompt: Prompt | null;
  isActive: boolean;
  onUpdate: (patch: PromptEditorPatch) => Promise<void>;
  onSetActive: () => Promise<void> | void;
  onResetToDefault: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onCreate?: (values: DraftValues) => Promise<void>;
  onCancelCreate?: () => void;
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function validate(values: DraftValues): string | null {
  if (!values.name.trim()) return "Name is required.";
  if (values.name.trim().length > MAX_NAME_CHARS) {
    return `Name must be ≤ ${MAX_NAME_CHARS} characters.`;
  }
  if (!isIconName(values.icon)) {
    return "Pick an icon.";
  }
  if (!values.prompt_text.trim()) {
    return "Prompt cannot be empty.";
  }
  if (utf8ByteLength(values.prompt_text) > MAX_PROMPT_TEXT_BYTES) {
    return `Prompt must be ≤ ${MAX_PROMPT_TEXT_BYTES} bytes.`;
  }
  return null;
}

export function PromptEditor({
  prompt,
  isActive,
  onUpdate,
  onSetActive,
  onResetToDefault,
  onDelete,
  onCreate,
  onCancelCreate,
}: PromptEditorProps) {
  const isCreating = prompt === null;

  const initialDraft: DraftValues = {
    name: prompt?.name ?? "",
    icon: (prompt && isIconName(prompt.icon) ? prompt.icon : "FileText") as IconName,
    prompt_text: prompt?.prompt_text ?? "",
  };
  const [draft, setDraft] = useState<DraftValues>(() => initialDraft);

  // Async save state — only "saving"/"saved"/"backend-error". Validation errors
  // are derived synchronously from the draft below.
  const [asyncStatus, setAsyncStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Track the latest persisted snapshot per prompt id so we can detect dirty
  // state. Held in a ref so reads inside the timer callback are always fresh
  // without retriggering effects.
  const persistedRef = useRef<DraftValues | null>(
    prompt
      ? {
          name: prompt.name,
          icon: (isIconName(prompt.icon) ? prompt.icon : "FileText") as IconName,
          prompt_text: prompt.prompt_text,
        }
      : null
  );
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Debounced auto-save. The effect schedules a timer that calls onUpdate; the
  // *result* of onUpdate is what triggers setAsyncStatus, so the effect body
  // itself does not synchronously setState.
  useEffect(() => {
    if (isCreating) return;
    if (!prompt) return;
    const persisted = persistedRef.current;
    if (!persisted) return;
    const dirty =
      draft.name !== persisted.name ||
      draft.icon !== persisted.icon ||
      draft.prompt_text !== persisted.prompt_text;
    if (!dirty) return;
    if (validate(draft) !== null) return; // validation error rendered synchronously below

    let cancelled = false;
    const handle = setTimeout(() => {
      const patch: PromptEditorPatch = {};
      if (draft.name !== persisted.name) patch.name = draft.name.trim();
      if (draft.icon !== persisted.icon) patch.icon = draft.icon;
      if (draft.prompt_text !== persisted.prompt_text)
        patch.prompt_text = draft.prompt_text;

      setAsyncStatus({ kind: "saving" });
      onUpdateRef
        .current(patch)
        .then(() => {
          if (!cancelled) {
            persistedRef.current = { ...draft };
            setAsyncStatus({ kind: "saved" });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : String(err);
            setAsyncStatus({ kind: "error", message });
          }
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, isCreating, prompt]);

  const validationError = validate(draft);
  const charCount = utf8ByteLength(draft.prompt_text);

  const handleCreate = async () => {
    if (validationError) return;
    if (!onCreate) return;
    setAsyncStatus({ kind: "saving" });
    try {
      await onCreate({
        name: draft.name.trim(),
        icon: draft.icon,
        prompt_text: draft.prompt_text,
      });
      setAsyncStatus({ kind: "saved" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAsyncStatus({ kind: "error", message });
    }
  };

  const isBuiltin = prompt?.kind === "builtin";
  const isCustom = prompt?.kind === "custom";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {isCreating ? "New prompt" : prompt?.name}
          </h2>
          <div
            data-testid="save-status"
            className="text-xs text-muted-foreground mt-0.5"
          >
            {isCreating
              ? validationError
                ? validationError
                : asyncStatus.kind === "saving"
                  ? "Saving..."
                  : asyncStatus.kind === "saved"
                    ? "Saved"
                    : "Fill in name, icon, and prompt to create"
              : validationError
                ? validationError
                : asyncStatus.kind === "saving"
                  ? "Saving..."
                  : asyncStatus.kind === "error"
                    ? asyncStatus.message
                    : "Saved automatically"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCreating && !isActive && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => void onSetActive()}
              data-testid="set-active-button"
            >
              Set as active
            </Button>
          )}
          {!isCreating && isActive && (
            <span className="text-xs text-amber-600 dark:text-amber-500 font-medium">
              Active
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt-name">Name</Label>
        <Input
          id="prompt-name"
          data-testid="prompt-name-input"
          value={draft.name}
          maxLength={MAX_NAME_CHARS}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Icon</Label>
        <IconPicker
          value={draft.icon}
          onChange={(next) => setDraft((prev) => ({ ...prev, icon: next }))}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-text">Prompt</Label>
          <span className="text-xs text-muted-foreground">
            {charCount}/{MAX_PROMPT_TEXT_BYTES}
          </span>
        </div>
        <Textarea
          id="prompt-text"
          data-testid="prompt-text-input"
          rows={12}
          value={draft.prompt_text}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, prompt_text: e.target.value }))
          }
          className="font-mono text-xs"
        />
      </div>

      <div className="flex items-center gap-2 justify-end">
        {isCreating ? (
          <>
            {onCancelCreate && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancelCreate}
                data-testid="cancel-create-button"
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => void handleCreate()}
              disabled={validationError !== null}
              data-testid="create-button"
            >
              Create
            </Button>
          </>
        ) : (
          <>
            {isBuiltin && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void onResetToDefault()}
                data-testid="reset-to-default-button"
              >
                Reset to default
              </Button>
            )}
            {isCustom && onDelete && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete "${prompt?.name}"?`)) {
                    void onDelete();
                  }
                }}
                data-testid="delete-button"
              >
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
