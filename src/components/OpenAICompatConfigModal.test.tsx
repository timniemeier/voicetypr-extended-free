
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { OpenAICompatConfigModal } from "./OpenAICompatConfigModal";

// Mock the invoke function from Tauri
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("OpenAICompatConfigModal", () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly when open", () => {
    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );
    expect(screen.getByText("Configure OpenAI-Compatible Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("API Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Model ID")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <OpenAICompatConfigModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );
    expect(screen.queryByText("Configure OpenAI-Compatible Provider")).not.toBeInTheDocument();
  });

  it("calls onClose when the cancel button is clicked", () => {
    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit with the correct data after a successful Test", async () => {
    const user = userEvent.setup();
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as Mock;
    invokeMock.mockResolvedValueOnce(undefined);
    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );
    await user.clear(screen.getByLabelText("API Base URL"));
    await user.type(screen.getByLabelText("API Base URL"), "https://api.example.com/v1");
    await user.type(screen.getByLabelText("Model ID"), "test-model");
    await user.type(screen.getByLabelText("API Key"), "test-key");

    // Must run Test first
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(screen.getByText("Save")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      });
    });
  });

  it("disables save until inputs valid and Test passes", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText("Save")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API Base URL"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "test-model" },
    });

    expect(screen.getByText("Save")).toBeDisabled();

    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(screen.getByText("Save")).not.toBeDisabled());
  });

  it("renders with the Ollama loopback default and shows the privacy helper text", () => {
    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultBaseUrl="http://localhost:11434/v1"
      />
    );

    expect(screen.getByLabelText("API Base URL")).toHaveValue("http://localhost:11434/v1");
    expect(
      screen.getByText("Privacy depends on the host you control.")
    ).toBeInTheDocument();
  });

  it("Test passes for Ollama defaults and enables Save (US3)", async () => {
    const user = userEvent.setup();
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultBaseUrl="http://localhost:11434/v1"
      />
    );

    await user.type(screen.getByLabelText("Model ID"), "llama3.2:3b");
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => {
      expect(screen.getByText("Connection successful")).toBeInTheDocument();
    });
    expect(screen.getByText("Save")).not.toBeDisabled();
  });

  it("Test surfaces the model-not-found error and keeps Save disabled (US3)", async () => {
    const user = userEvent.setup();
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as Mock;
    const failureMessage = "Model 'llama3.2:3b' not found in endpoint model list";
    invokeMock.mockRejectedValueOnce(failureMessage);

    render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultBaseUrl="http://localhost:11434/v1"
      />
    );

    await user.type(screen.getByLabelText("Model ID"), "llama3.2:3b");
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => {
      expect(screen.getByText(failureMessage)).toBeInTheDocument();
    });
    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("updates the form values when the props change", () => {
    const { rerender } = render(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultBaseUrl="https://initial.api.com/v1"
        defaultModel="initial-model"
      />
    );

    expect(screen.getByLabelText("API Base URL")).toHaveValue(
      "https://initial.api.com/v1"
    );
    expect(screen.getByLabelText("Model ID")).toHaveValue("initial-model");

    rerender(
      <OpenAICompatConfigModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        defaultBaseUrl="https://updated.api.com/v1"
        defaultModel="updated-model"
      />
    );

    expect(screen.getByLabelText("API Base URL")).toHaveValue(
      "https://updated.api.com/v1"
    );
    expect(screen.getByLabelText("Model ID")).toHaveValue("updated-model");
  });
});
