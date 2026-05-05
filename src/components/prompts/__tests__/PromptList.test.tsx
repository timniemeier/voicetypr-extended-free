import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { PromptList } from "../PromptList";
import { fixtureBuiltins, makeLibrary } from "./fixtures";

describe("PromptList", () => {
  it("renders BUILT-IN group with 4 entries in canonical order", () => {
    const library = makeLibrary();
    render(
      <PromptList
        library={library}
        selectedId={null}
        searchQuery=""
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );

    const builtinGroup = screen.getByTestId("prompt-group-builtin");
    const rows = builtinGroup.querySelectorAll("[data-testid^=prompt-row-]");
    expect(rows).toHaveLength(4);
    expect(rows[0].getAttribute("data-testid")).toBe("prompt-row-builtin:default");
    expect(rows[1].getAttribute("data-testid")).toBe("prompt-row-builtin:prompts");
    expect(rows[2].getAttribute("data-testid")).toBe("prompt-row-builtin:email");
    expect(rows[3].getAttribute("data-testid")).toBe("prompt-row-builtin:commit");
  });

  it("renders CUSTOM group beneath BUILT-IN", () => {
    const library = makeLibrary({
      prompts: [
        ...fixtureBuiltins,
        {
          id: "custom:abc",
          kind: "custom",
          name: "Slack reply",
          icon: "MessageSquare",
          prompt_text: "Slack body",
        },
      ],
    });
    render(
      <PromptList
        library={library}
        selectedId={null}
        searchQuery=""
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );
    expect(screen.getByTestId("prompt-group-custom")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-row-custom:abc")).toBeInTheDocument();
    expect(screen.getByText("Slack reply")).toBeInTheDocument();
  });

  it("renders New prompt entry", () => {
    render(
      <PromptList
        library={makeLibrary()}
        selectedId={null}
        searchQuery=""
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );
    expect(screen.getByTestId("prompt-new")).toBeInTheDocument();
  });

  it("filters by case-insensitive name substring", () => {
    const library = makeLibrary({
      prompts: [
        ...fixtureBuiltins,
        {
          id: "custom:c1",
          kind: "custom",
          name: "Slack reply",
          icon: "MessageSquare",
          prompt_text: "x",
        },
      ],
    });
    render(
      <PromptList
        library={library}
        selectedId={null}
        searchQuery="EMA"
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );
    expect(screen.getByTestId("prompt-row-builtin:email")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-row-builtin:default")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-row-custom:c1")).not.toBeInTheDocument();
  });

  it("shows empty-state when no matches", () => {
    render(
      <PromptList
        library={makeLibrary()}
        selectedId={null}
        searchQuery="zzz"
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );
    expect(screen.getByTestId("prompt-list-empty")).toBeInTheDocument();
  });

  it("renders the active dot next to the active prompt", () => {
    const library = makeLibrary({ active_prompt_id: "builtin:email" });
    render(
      <PromptList
        library={library}
        selectedId={null}
        searchQuery=""
        isCreating={false}
        onSelect={vi.fn()}
        onNewPrompt={vi.fn()}
      />
    );
    expect(screen.getByTestId("active-dot-builtin:email")).toBeInTheDocument();
    expect(screen.queryByTestId("active-dot-builtin:default")).not.toBeInTheDocument();
  });

  it("invokes onSelect when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PromptList
        library={makeLibrary()}
        selectedId={null}
        searchQuery=""
        isCreating={false}
        onSelect={onSelect}
        onNewPrompt={vi.fn()}
      />
    );
    await user.click(screen.getByTestId("prompt-row-builtin:email"));
    expect(onSelect).toHaveBeenCalledWith("builtin:email");
  });
});
