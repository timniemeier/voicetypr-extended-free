import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePromptLibrary } from "@/hooks/usePromptLibrary";
import { Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { PromptEditor, type PromptEditorPatch } from "../prompts/PromptEditor";
import { PromptList } from "../prompts/PromptList";

export function PromptsSection() {
  const {
    library,
    isLoading,
    error,
    createPrompt,
    updatePrompt,
    deletePrompt,
    resetPromptToDefault,
    setActivePrompt,
  } = usePromptLibrary();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Default-select the first built-in once loaded if nothing chosen yet.
  const effectiveSelectedId = useMemo(() => {
    if (isCreating) return null;
    if (selectedId) return selectedId;
    if (library && library.prompts.length > 0) {
      return library.prompts[0].id;
    }
    return null;
  }, [isCreating, selectedId, library]);

  const selectedPrompt = useMemo(() => {
    if (isCreating) return null;
    if (!library || !effectiveSelectedId) return null;
    return library.prompts.find((p) => p.id === effectiveSelectedId) ?? null;
  }, [library, effectiveSelectedId, isCreating]);

  const handleSelect = useCallback((id: string) => {
    setIsCreating(false);
    setSelectedId(id);
  }, []);

  const handleNewPrompt = useCallback(() => {
    setIsCreating(true);
    setSelectedId(null);
  }, []);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
  }, []);

  const handleUpdate = useCallback(
    async (patch: PromptEditorPatch) => {
      if (!selectedPrompt) return;
      try {
        await updatePrompt({ id: selectedPrompt.id, ...patch });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [selectedPrompt, updatePrompt]
  );

  const handleSetActive = useCallback(async () => {
    if (!selectedPrompt) return;
    try {
      await setActivePrompt(selectedPrompt.id);
      toast.success(`Active prompt: ${selectedPrompt.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  }, [selectedPrompt, setActivePrompt]);

  const handleResetToDefault = useCallback(async () => {
    if (!selectedPrompt) return;
    try {
      await resetPromptToDefault(selectedPrompt.id);
      toast.success("Reset to shipped default");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  }, [selectedPrompt, resetPromptToDefault]);

  const handleDelete = useCallback(async () => {
    if (!selectedPrompt) return;
    try {
      const next = await deletePrompt(selectedPrompt.id);
      // Select the new active (server has fallback-corrected if needed).
      setSelectedId(next.active_prompt_id);
      toast.success("Prompt deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  }, [selectedPrompt, deletePrompt]);

  const handleCreate = useCallback(
    async (values: { name: string; icon: string; prompt_text: string }) => {
      try {
        const created = await createPrompt(values);
        setIsCreating(false);
        setSelectedId(created.id);
        toast.success("Prompt created");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [createPrompt]
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <h1 className="text-2xl font-semibold">Prompts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Author and edit the post-processor instructions sent to the AI model.
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] divide-x divide-border/40">
        {/* Left pane: search + grouped list */}
        <div className="flex flex-col min-h-0">
          <div className="shrink-0 p-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts..."
                className="pl-8"
                data-testid="prompt-search-input"
              />
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3">
              {isLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : error ? (
                <p className="text-xs text-destructive">{error.message}</p>
              ) : library ? (
                <PromptList
                  library={library}
                  selectedId={effectiveSelectedId}
                  searchQuery={searchQuery}
                  isCreating={isCreating}
                  onSelect={handleSelect}
                  onNewPrompt={handleNewPrompt}
                />
              ) : null}
            </div>
          </ScrollArea>
        </div>

        {/* Right pane: editor */}
        <ScrollArea className="min-h-0">
          <div className="p-6 max-w-2xl">
            {library &&
              (isCreating || selectedPrompt) && (
                <PromptEditor
                  key={isCreating ? "__new__" : (selectedPrompt?.id ?? "__none__")}
                  prompt={selectedPrompt}
                  isActive={
                    selectedPrompt
                      ? selectedPrompt.id === library.active_prompt_id
                      : false
                  }
                  onUpdate={handleUpdate}
                  onSetActive={handleSetActive}
                  onResetToDefault={handleResetToDefault}
                  onDelete={selectedPrompt?.kind === "custom" ? handleDelete : undefined}
                  onCreate={handleCreate}
                  onCancelCreate={handleCancelCreate}
                />
              )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
