import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STTModelsSection } from '../STTModelsSection';
import type { AppSettings, ModelInfo } from '@/types';

// ---- Settings context mock ------------------------------------------------
//
// The ModelsSection reads `settings` and calls `updateSettings` for both the
// active-language change and the enabled-set change. The tests below capture
// every `updateSettings` call so we can assert exactly what was persisted —
// the production code is responsible for normalising the enabled set and
// falling back the active language per FR-010.

const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);

const baseSettings: AppSettings = {
  hotkey: 'CommandOrControl+Shift+Space',
  current_model: 'base',
  current_model_engine: 'whisper',
  language: 'en',
  theme: 'system',
  enabled_languages: ['en', 'de'],
};

let mockSettings: AppSettings = { ...baseSettings };

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mockSettings,
    isLoading: false,
    error: null,
    refreshSettings: vi.fn(),
    updateSettings: (updates: Partial<AppSettings>) => {
      // Simulate the optimistic update so the next `useSettings` call sees
      // the freshly written values (the real provider does the same — see
      // SettingsContext.tsx).
      mockSettings = { ...mockSettings, ...updates };
      return mockUpdateSettings(updates);
    },
  }),
}));

// ---- Tauri mocks ---------------------------------------------------------
//
// ModelsSection imports `invoke` directly (e.g. for `update_tray_menu` after
// disconnecting a cloud key). None of the language tests exercise that path,
// so a no-op mock is fine.

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

// ---- LanguageSelection mock ----------------------------------------------
//
// The real control wraps its rows in a Radix Popover that mounts via a
// portal and is closed by default — fighting the portal in jsdom adds
// noise without testing anything new about ModelsSection's wiring.
//
// Instead we replace it with a flat fixture that:
//   - exposes its props via DOM data-* attributes so the test can assert
//     "control collapses to single-row layout when enabled.length === 1"
//     (SC-003) — the contract the production code relies on is whether
//     it passes a length-1 set in;
//   - renders one button per known language code with stable test ids so
//     the test can drive add / remove / mark-active flows directly.
//
// All callback semantics live in the parent (ModelsSection) and are what
// this test file is here to verify.

const KNOWN_LANGUAGES = ['en', 'de', 'fr'] as const;

vi.mock('@/components/LanguageSelection', () => ({
  LanguageSelection: ({
    value,
    engine,
    englishOnly,
    enabledLanguages,
    onValueChange,
    onEnabledChange,
  }: {
    value: string;
    engine?: string;
    englishOnly?: boolean;
    enabledLanguages?: string[];
    onValueChange: (next: string) => void;
    onEnabledChange?: (next: string[]) => void;
  }) => {
    const enabled = enabledLanguages ?? [value];
    const layout =
      enabled.length === 1 ? 'single-row' : 'multi-row';
    return (
      <div
        data-testid="language-selection"
        data-engine={engine}
        data-english-only={englishOnly ? 'true' : 'false'}
        data-active={value}
        data-enabled={enabled.join(',')}
        data-layout={layout}
      >
        {KNOWN_LANGUAGES.map((code) => {
          const isEnabled = enabled.includes(code);
          const isActive = value === code;
          // Mirror the real component: in English-only mode, every non-EN
          // row is disabled.
          const rowDisabled = !!englishOnly && code !== 'en';
          return (
            <div key={code} data-testid={`language-row-${code}`} data-disabled={rowDisabled ? 'true' : 'false'}>
              <button
                type="button"
                data-testid={`language-toggle-${code}`}
                disabled={rowDisabled}
                onClick={() => {
                  if (!onEnabledChange) return;
                  if (isEnabled) {
                    onEnabledChange(enabled.filter((c) => c !== code));
                  } else {
                    onEnabledChange([...enabled, code]);
                  }
                }}
              >
                {isEnabled ? 'remove' : 'add'} {code}
              </button>
              <button
                type="button"
                data-testid={`language-active-${code}`}
                disabled={rowDisabled}
                data-is-active={isActive ? 'true' : 'false'}
                onClick={() => onValueChange(code)}
              >
                mark-active {code}
              </button>
            </div>
          );
        })}
      </div>
    );
  },
}));

// ---- Other ModelsSection children ---------------------------------------
//
// We only care about the language wiring here, so stub the heavyweight
// model card rendering paths and any cloud-provider helpers.

vi.mock('@/components/ModelCard', () => ({
  ModelCard: ({ name }: { name: string }) => (
    <div data-testid={`model-card-${name}`} />
  ),
}));

vi.mock('@/components/ApiKeyModal', () => ({
  ApiKeyModal: () => null,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const baseModel: ModelInfo = {
  name: 'base',
  display_name: 'Whisper Base',
  size: 100,
  url: '',
  sha256: '',
  downloaded: true,
  speed_score: 6,
  accuracy_score: 6,
  recommended: false,
  engine: 'whisper',
  kind: 'local',
  requires_setup: false,
};

const baseEnglishModel: ModelInfo = {
  ...baseModel,
  name: 'ggml-base.en',
  display_name: 'Whisper Base (English)',
  engine: 'whisper',
};

const parakeetV2Model: ModelInfo = {
  ...baseModel,
  name: 'parakeet-tdt-0.6b-v2',
  display_name: 'Parakeet v2',
  engine: 'parakeet',
};

interface RenderOpts {
  currentModel?: string;
  models?: [string, ModelInfo][];
}

const renderModelsSection = ({ currentModel, models }: RenderOpts = {}) => {
  return render(
    <STTModelsSection
      models={models ?? [['base', baseModel]]}
      downloadProgress={{}}
      verifyingModels={new Set()}
      currentModel={currentModel ?? mockSettings.current_model}
      onDownload={vi.fn()}
      onDelete={vi.fn()}
      onCancelDownload={vi.fn()}
      onSelect={vi.fn()}
      refreshModels={vi.fn().mockResolvedValue(undefined)}
    />,
  );
};

const getControl = (container: HTMLElement) =>
  container.querySelector('[data-testid="language-selection"]') as HTMLElement;

describe('ModelsSection — multi-language selection (T031)', () => {
  beforeEach(() => {
    mockSettings = {
      ...baseSettings,
      current_model: 'base',
      current_model_engine: 'whisper',
      language: 'en',
      enabled_languages: ['en', 'de'],
    };
    mockUpdateSettings.mockClear();
  });

  it('passes enabled_languages and active language down to LanguageSelection', async () => {
    const { container } = renderModelsSection();
    await waitFor(() => {
      expect(getControl(container)).toBeTruthy();
    });
    const control = getControl(container);
    expect(control.getAttribute('data-enabled')).toBe('en,de');
    expect(control.getAttribute('data-active')).toBe('en');
    expect(control.getAttribute('data-engine')).toBe('whisper');
    expect(control.getAttribute('data-english-only')).toBe('false');
  });

  it('adds a language by extending the enabled set via updateSettings', async () => {
    const { container, getByTestId } = renderModelsSection();
    await waitFor(() => expect(getControl(container)).toBeTruthy());

    await act(async () => {
      getByTestId('language-toggle-fr').click();
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      enabled_languages: ['en', 'de', 'fr'],
    });
    // Active language untouched.
    expect(mockUpdateSettings.mock.calls[0]?.[0]).not.toHaveProperty('language');
  });

  it('removing the active language falls back to the first remaining entry (FR-010)', async () => {
    mockSettings.language = 'en';
    mockSettings.enabled_languages = ['en', 'de'];

    const { container, getByTestId } = renderModelsSection();
    await waitFor(() => expect(getControl(container)).toBeTruthy());

    // Remove EN — the active language must fall back to DE (the first
    // remaining entry).
    await act(async () => {
      getByTestId('language-toggle-en').click();
    });

    expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      enabled_languages: ['de'],
      language: 'de',
    });
  });

  it('removing the last language resets to ["en"] with active = "en"', async () => {
    // Start with a single non-EN language so removing it triggers the
    // empty-set normalisation path.
    mockSettings.language = 'de';
    mockSettings.enabled_languages = ['de'];

    const { container, getByTestId } = renderModelsSection();
    await waitFor(() => expect(getControl(container)).toBeTruthy());

    await act(async () => {
      getByTestId('language-toggle-de').click();
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      enabled_languages: ['en'],
      language: 'en',
    });
  });

  it('marking a different enabled entry active updates the active language only', async () => {
    mockSettings.language = 'en';
    mockSettings.enabled_languages = ['en', 'de'];

    const { container, getByTestId } = renderModelsSection();
    await waitFor(() => expect(getControl(container)).toBeTruthy());

    await act(async () => {
      getByTestId('language-active-de').click();
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith({ language: 'de' });
    // The enabled set is unchanged.
    expect(mockUpdateSettings.mock.calls[0]?.[0]).not.toHaveProperty(
      'enabled_languages',
    );
  });

  it('collapses to a single-row layout when enabled_languages.length === 1 (SC-003)', async () => {
    mockSettings.language = 'en';
    mockSettings.enabled_languages = ['en'];

    const { container } = renderModelsSection();
    await waitFor(() => expect(getControl(container)).toBeTruthy());
    const control = getControl(container);
    expect(control.getAttribute('data-enabled')).toBe('en');
    expect(control.getAttribute('data-layout')).toBe('single-row');
  });

  it('disables non-EN entries when an English-only Whisper model is active', async () => {
    mockSettings.current_model = 'ggml-base.en';
    mockSettings.current_model_engine = 'whisper';
    mockSettings.language = 'en';
    mockSettings.enabled_languages = ['en', 'de'];

    const { container, getByTestId } = renderModelsSection({
      currentModel: 'ggml-base.en',
      models: [['ggml-base.en', baseEnglishModel]],
    });
    await waitFor(() => expect(getControl(container)).toBeTruthy());
    const control = getControl(container);
    expect(control.getAttribute('data-english-only')).toBe('true');
    expect(getByTestId('language-row-en').getAttribute('data-disabled')).toBe(
      'false',
    );
    expect(getByTestId('language-row-de').getAttribute('data-disabled')).toBe(
      'true',
    );
    expect(getByTestId('language-row-fr').getAttribute('data-disabled')).toBe(
      'true',
    );
  });

  it('disables non-EN entries when an English-only Parakeet (-v2) model is active', async () => {
    mockSettings.current_model = 'parakeet-tdt-0.6b-v2';
    mockSettings.current_model_engine = 'parakeet';
    mockSettings.language = 'en';
    mockSettings.enabled_languages = ['en'];

    const { container, getByTestId } = renderModelsSection({
      currentModel: 'parakeet-tdt-0.6b-v2',
      models: [['parakeet-tdt-0.6b-v2', parakeetV2Model]],
    });
    await waitFor(() => expect(getControl(container)).toBeTruthy());
    const control = getControl(container);
    expect(control.getAttribute('data-english-only')).toBe('true');
    expect(getByTestId('language-row-de').getAttribute('data-disabled')).toBe(
      'true',
    );
  });
});
