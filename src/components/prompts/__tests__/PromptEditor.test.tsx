import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PromptEditor } from "../PromptEditor";
import { fixtureBuiltins } from "./fixtures";
import type { Prompt } from "@/types/ai";

const builtinDefault: Prompt = fixtureBuiltins[0];
const customPrompt: Prompt = {
  id: "custom:abc",
  kind: "custom",
  name: "Slack reply",
  icon: "MessageSquare",
  prompt_text: "Body",
};

describe("PromptEditor", () => {

  it("renders Name + Icon + Prompt text fields populated from selected prompt", () => {
    render(
      <PromptEditor
        prompt={builtinDefault}
        isActive={true}
        onUpdate={vi.fn()}
        onSetActive={vi.fn()}
        onResetToDefault={vi.fn()}
      />
    );
    const nameInput = screen.getByTestId("prompt-name-input") as HTMLInputElement;
    const textArea = screen.getByTestId("prompt-text-input") as HTMLTextAreaElement;
    expect(nameInput.value).toBe("Default");
    expect(textArea.value).toBe("DEFAULT_TEXT");
    // Icon picker shows the FileText option as selected
    expect(screen.getByTestId("icon-picker-FileText")).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("auto-saves ~500ms after the last keystroke", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <PromptEditor
        prompt={builtinDefault}
        isActive={true}
        onUpdate={onUpdate}
        onSetActive={vi.fn()}
        onResetToDefault={vi.fn()}
      />
    );
    const textArea = screen.getByTestId("prompt-text-input");
    await user.type(textArea, " ADD");

    await waitFor(
      () => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt_text: "DEFAULT_TEXT ADD" })
    );
  });

  it("blocks save when prompt_text is empty and surfaces a validation error", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <PromptEditor
        prompt={builtinDefault}
        isActive={true}
        onUpdate={onUpdate}
        onSetActive={vi.fn()}
        onResetToDefault={vi.fn()}
      />
    );
    const textArea = screen.getByTestId("prompt-text-input");
    await user.clear(textArea);
    await waitFor(() => {
      expect(screen.getByTestId("save-status").textContent).toMatch(/empty/i);
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("shows Reset to default for built-ins", () => {
    render(
      <PromptEditor
        prompt={builtinDefault}
        isActive={true}
        onUpdate={vi.fn()}
        onSetActive={vi.fn()}
        onResetToDefault={vi.fn()}
      />
    );
    expect(screen.getByTestId("reset-to-default-button")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-button")).not.toBeInTheDocument();
  });

  it("shows Delete and hides Reset for custom prompts", () => {
    const onDelete = vi.fn();
    render(
      <PromptEditor
        prompt={customPrompt}
        isActive={false}
        onUpdate={vi.fn()}
        onSetActive={vi.fn()}
        onResetToDefault={vi.fn()}
        onDelete={onDelete}
      />
    );
    expect(screen.queryByTestId("reset-to-default-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("delete-button")).toBeInTheDocument();
  });

  it("Reset restores name + icon + prompt text via onResetToDefault", async () => {
    const onResetToDefault = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PromptEditor
        prompt={builtinDefault}
        isActive={true}
        onUpdate={vi.fn()}
        onSetActive={vi.fn()}
        onResetToDefault={onResetToDefault}
      />
    );
    await user.click(screen.getByTestId("reset-to-default-button"));
    expect(onResetToDefault).toHaveBeenCalled();
  });
});
