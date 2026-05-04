import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancementsSection } from '../EnhancementsSection';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/utils/keyring', () => ({
  saveApiKey: vi.fn().mockResolvedValue(undefined),
  hasApiKey: vi.fn().mockResolvedValue(false),
  removeApiKey: vi.fn().mockResolvedValue(undefined),
  getApiKey: vi.fn().mockResolvedValue(null),
  keyringSet: vi.fn().mockResolvedValue(undefined),
}));

// Mock models returned by list_provider_models
const mockModels = {
  openai: [
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', recommended: true },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', recommended: true },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', recommended: true },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', recommended: true },
  ],
};

describe('EnhancementsSection', () => {
  const mockAISettings = {
    enabled: false,
    provider: '',
    model: '',
    hasApiKey: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({
          preset: 'Default',
          custom_vocabulary: []
        });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider || '';
        return Promise.resolve({
          ...mockAISettings,
          provider,
          hasApiKey: false,
        });
      }
      if (cmd === 'list_provider_models') {
        const provider = (args as { provider: string })?.provider;
        return Promise.resolve(mockModels[provider as keyof typeof mockModels] || []);
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://api.openai.com/v1' });
      }
      if (cmd === 'get_custom_prompts') {
        return Promise.resolve({ base: null, prompts: null, email: null, commit: null });
      }
      if (cmd === 'get_default_prompts') {
        return Promise.resolve({
          base: 'DEFAULT BASE {language}',
          prompts: 'DEFAULT PROMPTS',
          email: 'DEFAULT EMAIL',
          commit: 'DEFAULT COMMIT',
        });
      }
      if (cmd === 'update_custom_prompts') {
        return Promise.resolve();
      }
      return Promise.resolve(mockAISettings);
    });
  });

  it('renders the enhancements section', async () => {
    render(<EnhancementsSection />);
    
    expect(screen.getByText('AI Formatting')).toBeInTheDocument();
    
    // Wait for providers to load
    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
    });
  });

  it('displays all available providers', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    // Custom Provider is in the same list
    await waitFor(() => {
      expect(screen.getByText('Custom (OpenAI-compatible)')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows Add Key button when no API key is set', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      const addKeyButtons = screen.getAllByText('Add Key');
      expect(addKeyButtons.length).toBeGreaterThan(0);
    });
  });

  it('opens API key modal when Add Key is clicked', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      const addKeyButtons = screen.getAllByText('Add Key');
      expect(addKeyButtons.length).toBeGreaterThan(0);
      fireEvent.click(addKeyButtons[0]);
    });
    
    await waitFor(() => {
      const modalTitle = screen.getByText(/Add OpenAI API Key/);
      expect(modalTitle).toBeInTheDocument();
    });
  });

  it('disables enhancement toggle when no API key', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeDisabled();
    });
  });

  it('enables enhancement toggle when API key exists and model is selected', async () => {
    const { hasApiKey } = await import('@/utils/keyring');
    
    (hasApiKey as ReturnType<typeof vi.fn>).mockImplementation((provider: string) => {
      return Promise.resolve(provider === 'gemini');
    });
    
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: false,
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          hasApiKey: true,
        });
      }
      if (cmd === 'list_provider_models') {
        return Promise.resolve(mockModels.gemini);
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://api.openai.com/v1' });
      }
      return Promise.resolve();
    });
    
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeEnabled();
    });
  });

  it('enables enhancement toggle for custom no-auth config without keyring key', async () => {
    const { hasApiKey } = await import('@/utils/keyring');

    (hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: false,
          provider: 'custom',
          model: 'local-model',
          hasApiKey: true,
        });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider;
        return Promise.resolve({
          enabled: false,
          provider,
          model: 'local-model',
          hasApiKey: provider === 'custom',
        });
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://custom.endpoint/v1' });
      }
      return Promise.resolve();
    });

    render(<EnhancementsSection />);

    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeEnabled();
    });
  });

  it('enables enhancement toggle for legacy openai-compatible config without keyring key', async () => {
    const { hasApiKey } = await import('@/utils/keyring');

    (hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: false,
          provider: 'openai',
          model: 'legacy-model',
          hasApiKey: true,
        });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider;
        return Promise.resolve({
          enabled: false,
          provider,
          model: 'legacy-model',
          hasApiKey: provider === 'openai',
        });
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://legacy.endpoint/v1' });
      }
      return Promise.resolve();
    });

    render(<EnhancementsSection />);

    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeEnabled();
    });
  });

  it('toggles AI enhancement', async () => {
    const { hasApiKey } = await import('@/utils/keyring');
    
    (hasApiKey as ReturnType<typeof vi.fn>).mockImplementation((provider: string) => {
      return Promise.resolve(provider === 'gemini');
    });
    
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: false,
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          hasApiKey: true,
        });
      }
      if (cmd === 'list_provider_models') {
        return Promise.resolve(mockModels.gemini);
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://api.openai.com/v1' });
      }
      return Promise.resolve();
    });
    
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Formatting')).toBeInTheDocument();
    });
    
    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeEnabled();
      fireEvent.click(toggle);
    });
    
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('update_ai_settings', {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-1.5-flash',
      });
      expect(toast.success).toHaveBeenCalledWith('AI formatting enabled');
    });
  });

  it('displays provider cards', async () => {
    const { hasApiKey } = await import('@/utils/keyring');
    (hasApiKey as ReturnType<typeof vi.fn>).mockImplementation((provider: string) => {
      return Promise.resolve(provider === 'gemini');
    });
    
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: false,
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          hasApiKey: true,
        });
      }
      if (cmd === 'list_provider_models') {
        return Promise.resolve(mockModels.gemini);
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://api.openai.com/v1' });
      }
      return Promise.resolve();
    });
    
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    });
  });

  it('handles API key submission', async () => {
    const { saveApiKey } = await import('@/utils/keyring');
    
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      const addKeyButtons = screen.getAllByText('Add Key');
      expect(addKeyButtons.length).toBeGreaterThan(0);
      fireEvent.click(addKeyButtons[0]);
    });
    
    await waitFor(() => {
      const modalTitle = screen.getByText(/Add OpenAI API Key/);
      expect(modalTitle).toBeInTheDocument();
    });
    
    const input = screen.getByPlaceholderText(/Enter your OpenAI API key/);
    fireEvent.change(input, { target: { value: 'sk-test-api-key-12345' } });
    
    const submitButton = screen.getByText('Save API Key');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(saveApiKey).toHaveBeenCalled();
    });
  });

  it('shows Quick Setup guide when AI is disabled', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      expect(screen.getByText('Quick Setup')).toBeInTheDocument();
      expect(screen.getByText(/Choose a provider above/)).toBeInTheDocument();
    });
  });

  it('shows Formatting Options section', async () => {
    render(<EnhancementsSection />);
    
    await waitFor(() => {
      expect(screen.getByText('Formatting Options')).toBeInTheDocument();
    });
  });

  it('does not clear active OpenAI selection when custom key is removed', async () => {
    const { hasApiKey } = await import('@/utils/keyring');

    (hasApiKey as ReturnType<typeof vi.fn>).mockImplementation((provider: string) => {
      return Promise.resolve(provider === 'openai' || provider === 'custom');
    });

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: true,
          provider: 'openai',
          model: 'gpt-5-nano',
          hasApiKey: true,
        });
      }
      if (cmd === 'list_provider_models') {
        const provider = (args as { provider: string })?.provider;
        return Promise.resolve(mockModels[provider as keyof typeof mockModels] || []);
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://custom.endpoint/v1' });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider;
        return Promise.resolve({
          enabled: true,
          provider,
          model: 'gpt-5-nano',
          hasApiKey: provider === 'custom',
        });
      }
      return Promise.resolve();
    });

    render(<EnhancementsSection />);

    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
    });

    await emit('api-key-removed', { provider: 'custom' });

    await waitFor(() => {
      expect(invoke).not.toHaveBeenCalledWith('update_ai_settings', {
        enabled: false,
        provider: '',
        model: '',
      });
    });
  });

  it('does not clear active OpenAI selection when openai key is removed but legacy config exists', async () => {
    const { hasApiKey } = await import('@/utils/keyring');

    // No keyring key, but backend reports legacy config is usable.
    (hasApiKey as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({
          enabled: true,
          provider: 'openai',
          model: 'legacy-model',
          hasApiKey: true,
        });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider;
        return Promise.resolve({
          enabled: true,
          provider,
          model: 'legacy-model',
          hasApiKey: provider === 'openai',
        });
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://legacy.endpoint/v1' });
      }
      if (cmd === 'list_provider_models') {
        const provider = (args as { provider: string })?.provider;
        return Promise.resolve(mockModels[provider as keyof typeof mockModels] || []);
      }
      return Promise.resolve();
    });

    render(<EnhancementsSection />);

    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
    });

    await emit('api-key-removed', { provider: 'openai' });

    await waitFor(() => {
      expect(invoke).not.toHaveBeenCalledWith('update_ai_settings', {
        enabled: false,
        provider: '',
        model: '',
      });
    });
  });

  it('renders provider cards in the documented order: OpenAI → Anthropic → Google Gemini → Ollama → Custom (US1 T012)', async () => {
    render(<EnhancementsSection />);

    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
    });

    const expectedNames = [
      'OpenAI',
      'Anthropic',
      'Google Gemini',
      'Ollama',
      'Custom (OpenAI-compatible)',
    ];

    await waitFor(() => {
      for (const name of expectedNames) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    // Verify document order by walking the DOM positions.
    const rendered = expectedNames.map((name) => screen.getByText(name));
    for (let i = 1; i < rendered.length; i += 1) {
      const previous = rendered[i - 1];
      const current = rendered[i];
      const relation = previous.compareDocumentPosition(current);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('configures Ollama through the OpenAI-compatible modal with the loopback default (US1 T013)', async () => {
    const { saveApiKey } = await import('@/utils/keyring');

    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_ai_settings') {
        return Promise.resolve({ enabled: false, provider: '', model: '', hasApiKey: false });
      }
      if (cmd === 'get_ai_settings_for_provider') {
        const provider = (args as { provider?: string })?.provider || '';
        return Promise.resolve({ enabled: false, provider, model: '', hasApiKey: false });
      }
      if (cmd === 'get_enhancement_options') {
        return Promise.resolve({ preset: 'Default', custom_vocabulary: [] });
      }
      if (cmd === 'get_openai_config') {
        return Promise.resolve({ baseUrl: 'https://api.openai.com/v1' });
      }
      if (cmd === 'get_custom_prompts') {
        return Promise.resolve({ base: null, prompts: null, email: null, commit: null });
      }
      if (cmd === 'get_default_prompts') {
        return Promise.resolve({ base: '', prompts: '', email: '', commit: '' });
      }
      if (cmd === 'test_openai_endpoint') {
        return Promise.resolve();
      }
      if (cmd === 'validate_and_cache_api_key') {
        return Promise.resolve();
      }
      if (cmd === 'update_ai_settings') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    render(<EnhancementsSection />);

    await waitFor(() => {
      expect(screen.getByText('Ollama')).toBeInTheDocument();
    });

    // Click the Ollama card's Configure button. There are two Configure buttons
    // (Ollama + Custom); the Ollama card is rendered before Custom, so the first
    // matches the Ollama row.
    const configureButtons = screen.getAllByRole('button', { name: /configure/i });
    expect(configureButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(configureButtons[0]);

    // Modal opens with the Ollama loopback default URL pre-filled.
    const baseUrlInput = (await screen.findByLabelText('API Base URL')) as HTMLInputElement;
    expect(baseUrlInput.value).toBe('http://localhost:11434/v1');

    // Type the model id and run the Test → Save flow.
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'llama3.2:3b' } });
    fireEvent.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('validate_and_cache_api_key', {
        args: {
          provider: 'ollama',
          apiKey: undefined,
          baseUrl: 'http://localhost:11434/v1',
          model: 'llama3.2:3b',
        },
      });
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('update_ai_settings', {
        enabled: true,
        provider: 'ollama',
        model: 'llama3.2:3b',
      });
    });

    // No bearer token was supplied → saveApiKey('ollama', …) must NOT be invoked.
    expect(saveApiKey).not.toHaveBeenCalledWith('ollama', expect.anything());
  });

  it('shows a toast naming the configured Ollama URL when formatting fails (US2 T027)', async () => {
    render(<EnhancementsSection />);

    await waitFor(() => {
      expect(screen.getByText('AI Providers')).toBeInTheDocument();
    });

    const failureMessage =
      'AI formatting failed at http://localhost:11434/v1: network error: connection refused';
    await emit('formatting-error', failureMessage);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(failureMessage);
    });
  });

  it('persists custom prompt overrides on blur', async () => {
    render(<EnhancementsSection />);

    // Wait for the section (and the default prompts) to load.
    await waitFor(() => {
      expect(screen.getByText('Custom Prompts (Advanced)')).toBeInTheDocument();
    });

    // Expand the panel.
    fireEvent.click(screen.getByTestId('custom-prompts-toggle'));

    // Wait for the textarea to render with the default value.
    const baseTextarea = await screen.findByTestId('custom-prompt-base') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(baseTextarea.value).toBe('DEFAULT BASE {language}');
    });

    // Edit the value, then blur to trigger persistence.
    fireEvent.change(baseTextarea, { target: { value: 'CUSTOM BASE {language}' } });
    fireEvent.blur(baseTextarea);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('update_custom_prompts', {
        prompts: {
          base: 'CUSTOM BASE {language}',
          prompts: null,
          email: null,
          commit: null,
        },
      });
    });
  });
});
