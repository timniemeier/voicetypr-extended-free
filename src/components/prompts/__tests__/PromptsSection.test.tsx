import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { PromptsSection } from "@/components/sections/PromptsSection";
import { fixtureBuiltins, makeLibrary } from "./fixtures";
import type { Prompt, PromptLibrary } from "@/types/ai";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

interface MockBackend {
  library: PromptLibrary;
}

function setupBackend(initial: PromptLibrary = makeLibrary()): MockBackend {
  const state: MockBackend = { library: initial };
  (invoke as ReturnType<typeof vi.fn>).mockImplementation(
    (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_prompts") {
        return Promise.resolve(JSON.parse(JSON.stringify(state.library)));
      }
      if (cmd === "set_active_prompt") {
        const id = (args as { id: string }).id;
        state.library.active_prompt_id = id;
        return Promise.resolve(id);
      }
      if (cmd === "update_prompt") {
        const a = args as { id: string; name?: string; icon?: string; prompt_text?: string };
        const idx = state.library.prompts.findIndex((p) => p.id === a.id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        const next = { ...state.library.prompts[idx] };
        if (a.name !== undefined) next.name = a.name;
        if (a.icon !== undefined) next.icon = a.icon;
        if (a.prompt_text !== undefined) next.prompt_text = a.prompt_text;
        state.library.prompts[idx] = next;
        return Promise.resolve(next);
      }
      if (cmd === "create_prompt") {
        const a = args as { name: string; icon: string; prompt_text: string };
        const created: Prompt = {
          id: `custom:${Math.random().toString(36).slice(2)}`,
          kind: "custom",
          name: a.name,
          icon: a.icon,
          prompt_text: a.prompt_text,
        };
        state.library.prompts.push(created);
        return Promise.resolve(created);
      }
      if (cmd === "delete_prompt") {
        const id = (args as { id: string }).id;
        state.library.prompts = state.library.prompts.filter((p) => p.id !== id);
        if (state.library.active_prompt_id === id) {
          state.library.active_prompt_id = "builtin:default";
        }
        return Promise.resolve(JSON.parse(JSON.stringify(state.library)));
      }
      if (cmd === "reset_prompt_to_default") {
        const id = (args as { id: string }).id;
        const idx = state.library.prompts.findIndex((p) => p.id === id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        const reset = { ...state.library.prompts[idx], prompt_text: "DEFAULT_RESET" };
        state.library.prompts[idx] = reset;
        return Promise.resolve(reset);
      }
      return Promise.reject(new Error(`unmocked cmd: ${cmd}`));
    }
  );
  return state;
}

describe("PromptsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clicking a row opens the editor without changing active_prompt_id", async () => {
    setupBackend();
    const user = userEvent.setup();
    render(<PromptsSection />);
    await waitFor(() => {
      expect(screen.getByTestId("prompt-row-builtin:email")).toBeInTheDocument();
    });

    // Default is active (orange dot on Default)
    expect(screen.getByTestId("active-dot-builtin:default")).toBeInTheDocument();

    await user.click(screen.getByTestId("prompt-row-builtin:email"));

    // Email editor open: name field shows Email
    const nameInput = screen.getByTestId("prompt-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Email");

    // Active dot still on default — selection != activation
    expect(screen.getByTestId("active-dot-builtin:default")).toBeInTheDocument();
    expect(screen.queryByTestId("active-dot-builtin:email")).not.toBeInTheDocument();
  });

  it("Set as active changes active_prompt_id and moves the orange dot", async () => {
    const backend = setupBackend();
    const user = userEvent.setup();
    render(<PromptsSection />);
    await waitFor(() => {
      expect(screen.getByTestId("prompt-row-builtin:email")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("prompt-row-builtin:email"));
    await user.click(screen.getByTestId("set-active-button"));

    await waitFor(() => {
      expect(screen.getByTestId("active-dot-builtin:email")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("active-dot-builtin:default")).not.toBeInTheDocument();
    expect(backend.library.active_prompt_id).toBe("builtin:email");
  });

  it("clicking New prompt opens a fresh editor with disabled save (FR-013a)", async () => {
    setupBackend();
    const user = userEvent.setup();
    render(<PromptsSection />);
    await waitFor(() => {
      expect(screen.getByTestId("prompt-new")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("prompt-new"));

    const nameInput = screen.getByTestId("prompt-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(screen.getByTestId("create-button")).toBeDisabled();
  });

  it("creating a custom prompt does NOT auto-activate it (FR-013)", async () => {
    const backend = setupBackend();
    const user = userEvent.setup();
    render(<PromptsSection />);
    await waitFor(() => expect(screen.getByTestId("prompt-new")).toBeInTheDocument());

    await user.click(screen.getByTestId("prompt-new"));
    await user.type(screen.getByTestId("prompt-name-input"), "Slack reply");
    await user.click(screen.getByTestId("icon-picker-MessageSquare"));
    await user.type(screen.getByTestId("prompt-text-input"), "Casual reply.");

    expect(screen.getByTestId("create-button")).not.toBeDisabled();
    await user.click(screen.getByTestId("create-button"));

    // After creation: active is still default
    await waitFor(() =>
      expect(backend.library.prompts.some((p) => p.kind === "custom")).toBe(true)
    );
    expect(backend.library.active_prompt_id).toBe("builtin:default");
  });

  it("deleting the active custom prompt falls active back to builtin:default (FR-011)", async () => {
    const backend = setupBackend(
      makeLibrary({
        active_prompt_id: "custom:abc",
        prompts: [
          ...fixtureBuiltins,
          {
            id: "custom:abc",
            kind: "custom",
            name: "Slack",
            icon: "MessageSquare",
            prompt_text: "x",
          },
        ],
      })
    );
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromptsSection />);
    await waitFor(() => expect(screen.getByTestId("prompt-row-custom:abc")).toBeInTheDocument());

    await user.click(screen.getByTestId("prompt-row-custom:abc"));
    await user.click(screen.getByTestId("delete-button"));

    await waitFor(() => expect(backend.library.active_prompt_id).toBe("builtin:default"));
    confirmSpy.mockRestore();
  });

  it("deleting a non-active custom prompt leaves active selection alone", async () => {
    const backend = setupBackend(
      makeLibrary({
        active_prompt_id: "builtin:email",
        prompts: [
          ...fixtureBuiltins,
          {
            id: "custom:abc",
            kind: "custom",
            name: "Slack",
            icon: "MessageSquare",
            prompt_text: "x",
          },
        ],
      })
    );
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromptsSection />);
    await waitFor(() => expect(screen.getByTestId("prompt-row-custom:abc")).toBeInTheDocument());

    await user.click(screen.getByTestId("prompt-row-custom:abc"));
    await user.click(screen.getByTestId("delete-button"));

    await waitFor(() =>
      expect(backend.library.prompts.find((p) => p.id === "custom:abc")).toBeUndefined()
    );
    expect(backend.library.active_prompt_id).toBe("builtin:email");
    confirmSpy.mockRestore();
  });

  it("typing valid name/icon/text and pausing creates a row in CUSTOM group", async () => {
    setupBackend();
    const user = userEvent.setup();
    render(<PromptsSection />);
    await waitFor(() => expect(screen.getByTestId("prompt-new")).toBeInTheDocument());
    await user.click(screen.getByTestId("prompt-new"));

    await user.type(screen.getByTestId("prompt-name-input"), "Slack reply");
    await user.click(screen.getByTestId("icon-picker-MessageSquare"));
    await user.type(screen.getByTestId("prompt-text-input"), "Casual reply.");
    await user.click(screen.getByTestId("create-button"));

    await waitFor(() => {
      const customGroup = screen.getByTestId("prompt-group-custom");
      expect(customGroup.textContent).toContain("Slack reply");
    });
  });
});
