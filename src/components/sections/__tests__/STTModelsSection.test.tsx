import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { STTModelsSection } from "../STTModelsSection";

// Mock useSettings since the section reads `language` from it.
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      hotkey: "CommandOrControl+Shift+Space",
      current_model: "",
      language: "en",
      theme: "system",
      current_model_engine: "whisper",
    },
    updateSettings: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/cloudProviders", () => ({
  getCloudProviderByModel: () => null,
  getCloudProviders: () => [],
}));

const noopAsync = vi.fn().mockResolvedValue(undefined);

const baseProps = {
  models: [] as [string, never][],
  downloadProgress: {} as Record<string, number>,
  verifyingModels: new Set<string>(),
  currentModel: "",
  onDownload: noopAsync,
  onDelete: noopAsync,
  onCancelDownload: noopAsync,
  onSelect: noopAsync,
  refreshModels: noopAsync,
};

describe("STTModelsSection (US2)", () => {
  it("header reads STT Models (not Models)", () => {
    render(<STTModelsSection {...baseProps} />);
    expect(screen.getByText("STT Models")).toBeInTheDocument();
  });

  it("renders the language selection control", () => {
    render(<STTModelsSection {...baseProps} />);
    // LanguageSelection adds a label or aria-label "Spoken language"; loosen
    // to a substring match so we don't depend on its internals.
    expect(screen.getByText(/Spoken language/i)).toBeInTheDocument();
  });
});
