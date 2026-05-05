import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LLMModelsSection } from "../LLMModelsSection";

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

vi.mock("@/utils/keyring", () => ({
  saveApiKey: vi.fn().mockResolvedValue(undefined),
  hasApiKey: vi.fn().mockResolvedValue(false),
  removeApiKey: vi.fn().mockResolvedValue(undefined),
  getApiKey: vi.fn().mockResolvedValue(null),
  keyringSet: vi.fn().mockResolvedValue(undefined),
}));

const mockModels = {
  openai: [
    { id: "gpt-5-nano", name: "GPT-5 Nano", recommended: true },
    { id: "gpt-5-mini", name: "GPT-5 Mini", recommended: true },
  ],
  gemini: [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", recommended: true }],
};

const mockAISettings = {
  enabled: false,
  provider: "",
  model: "",
  hasApiKey: false,
};

describe("LLMModelsSection (US2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "get_ai_settings") {
          return Promise.resolve(mockAISettings);
        }
        if (cmd === "get_ai_settings_for_provider") {
          const provider = (args as { provider?: string })?.provider || "";
          return Promise.resolve({ ...mockAISettings, provider, hasApiKey: false });
        }
        if (cmd === "list_provider_models") {
          const provider = (args as { provider: string })?.provider;
          return Promise.resolve(
            mockModels[provider as keyof typeof mockModels] || []
          );
        }
        if (cmd === "get_openai_config") {
          return Promise.resolve({ baseUrl: "https://api.openai.com/v1" });
        }
        return Promise.resolve(mockAISettings);
      }
    );
  });

  it("renders the LLM Models header (not Formatting)", async () => {
    render(<LLMModelsSection />);
    expect(screen.getByText("LLM Models")).toBeInTheDocument();
    expect(screen.queryByText("Formatting")).not.toBeInTheDocument();
  });

  it("renders the AI Providers section + Setup Guide", async () => {
    render(<LLMModelsSection />);
    await waitFor(() => {
      expect(screen.getByText("AI Providers")).toBeInTheDocument();
    });
    expect(screen.getByText("Quick Setup")).toBeInTheDocument();
  });

  it("does NOT render the preset-pill picker (EnhancementSettings)", async () => {
    render(<LLMModelsSection />);
    await waitFor(() => {
      expect(screen.getByText("AI Providers")).toBeInTheDocument();
    });
    // The pill picker rendered four <Button>s with these exact labels. After
    // US2 they live in the Prompts tab.
    expect(
      screen.queryByRole("button", { name: /^Default$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Email$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Commit$/ })
    ).not.toBeInTheDocument();
  });

  it("does NOT render the Custom Prompts (Advanced) collapsible", async () => {
    render(<LLMModelsSection />);
    await waitFor(() => {
      expect(screen.getByText("AI Providers")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Custom Prompts \(Advanced\)/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-prompts-toggle")).not.toBeInTheDocument();
  });

  it("master AI on/off toggle is present at the top of the section", () => {
    render(<LLMModelsSection />);
    expect(screen.getByLabelText(/AI Formatting/)).toBeInTheDocument();
  });
});
