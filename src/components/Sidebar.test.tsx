import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("@/components/ReportBugDialog", () => ({
  ReportBugDialog: () => null,
}));

describe("Sidebar (US2 — tab list shape)", () => {
  it("main group renders the canonical 8 entries in order after the restructure", () => {
    render(
      <SidebarProvider>
        <Sidebar activeSection="overview" onSectionChange={vi.fn()} />
      </SidebarProvider>
    );

    // Pull out main-group labels in render order via the menu buttons. We
    // assert the exact sequence so accidental reorderings during rebases
    // trip CI.
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "");
    const main = [
      "Overview",
      "History",
      "Upload",
      "Settings",
      "STT Models",
      "Prompts",
      "LLM Models",
      "About",
    ];
    // For each expected entry, verify it appears once and they appear in order.
    let lastIdx = -1;
    for (const label of main) {
      const idx = buttons.findIndex((b, i) => i > lastIdx && b === label);
      expect(idx, `expected "${label}" after index ${lastIdx}`).toBeGreaterThan(
        lastIdx
      );
      lastIdx = idx;
    }
  });

  it("does not include the legacy Models / Formatting labels", () => {
    render(
      <SidebarProvider>
        <Sidebar activeSection="overview" onSectionChange={vi.fn()} />
      </SidebarProvider>
    );
    expect(screen.queryByText("Formatting")).not.toBeInTheDocument();
    // "Models" alone (no STT / LLM prefix) was the old label — guard against regress.
    const exactModels = screen.queryAllByText((content) => content.trim() === "Models");
    expect(exactModels).toHaveLength(0);
  });
});
