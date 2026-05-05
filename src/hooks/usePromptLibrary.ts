import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Prompt, PromptLibrary } from "@/types/ai";

interface CreatePromptInput extends Record<string, unknown> {
  name: string;
  icon: string;
  prompt_text: string;
}

interface UpdatePromptInput extends Record<string, unknown> {
  id: string;
  name?: string;
  icon?: string;
  prompt_text?: string;
}

export interface UsePromptLibraryResult {
  library: PromptLibrary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  listPrompts: () => Promise<PromptLibrary>;
  createPrompt: (input: CreatePromptInput) => Promise<Prompt>;
  updatePrompt: (input: UpdatePromptInput) => Promise<Prompt>;
  deletePrompt: (id: string) => Promise<PromptLibrary>;
  resetPromptToDefault: (id: string) => Promise<Prompt>;
  setActivePrompt: (id: string) => Promise<string>;
}

export function usePromptLibrary(): UsePromptLibraryResult {
  const [library, setLibrary] = useState<PromptLibrary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const listPrompts = useCallback(async (): Promise<PromptLibrary> => {
    return await invoke<PromptLibrary>("list_prompts");
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const lib = await listPrompts();
      setLibrary(lib);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
    } finally {
      setIsLoading(false);
    }
  }, [listPrompts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Spec 002 — US1 (FU-2 Option B): the global cycle-preset hotkey writes
  // to the same `prompts` store this hook reads from, then emits
  // `active-prompt-changed { id, label }`. Mirror the new active id locally
  // so the Prompts tab stays in sync without a full reload.
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    listen<{ id: string; label?: string }>("active-prompt-changed", (event) => {
      if (!isMounted) return;
      const id = event.payload?.id;
      if (!id) return;
      setLibrary((prev) =>
        prev && prev.active_prompt_id !== id ? { ...prev, active_prompt_id: id } : prev
      );
    }).then((unlisten) => {
      if (!isMounted) {
        unlisten();
        return;
      }
      unlistenFn = unlisten;
    });

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const applyOptimistic = useCallback((updater: (prev: PromptLibrary) => PromptLibrary) => {
    setLibrary((prev) => (prev ? updater(prev) : prev));
  }, []);

  const createPrompt = useCallback(
    async (input: CreatePromptInput): Promise<Prompt> => {
      try {
        const created = await invoke<Prompt>("create_prompt", input);
        applyOptimistic((prev) => ({
          ...prev,
          prompts: [...prev.prompts, created],
        }));
        return created;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [applyOptimistic, refresh]
  );

  const updatePrompt = useCallback(
    async (input: UpdatePromptInput): Promise<Prompt> => {
      try {
        const updated = await invoke<Prompt>("update_prompt", input);
        applyOptimistic((prev) => ({
          ...prev,
          prompts: prev.prompts.map((p) => (p.id === updated.id ? updated : p)),
        }));
        return updated;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [applyOptimistic, refresh]
  );

  const deletePrompt = useCallback(
    async (id: string): Promise<PromptLibrary> => {
      try {
        const next = await invoke<PromptLibrary>("delete_prompt", { id });
        setLibrary(next);
        return next;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [refresh]
  );

  const resetPromptToDefault = useCallback(
    async (id: string): Promise<Prompt> => {
      try {
        const reset = await invoke<Prompt>("reset_prompt_to_default", { id });
        applyOptimistic((prev) => ({
          ...prev,
          prompts: prev.prompts.map((p) => (p.id === reset.id ? reset : p)),
        }));
        return reset;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [applyOptimistic, refresh]
  );

  const setActivePrompt = useCallback(
    async (id: string): Promise<string> => {
      try {
        const next = await invoke<string>("set_active_prompt", { id });
        applyOptimistic((prev) => ({ ...prev, active_prompt_id: next }));
        return next;
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [applyOptimistic, refresh]
  );

  return {
    library,
    isLoading,
    error,
    refresh,
    listPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    resetPromptToDefault,
    setActivePrompt,
  };
}
