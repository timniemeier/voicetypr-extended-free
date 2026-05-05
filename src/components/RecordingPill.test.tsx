import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingPill } from './RecordingPill';

const mockRecording: { state: string } = { state: 'idle' };
const mockSettings: Record<string, unknown> = {
  pill_indicator_mode: 'when_recording',
  pill_indicator_offset: 10,
  pill_show_preset: false,
  pill_show_language: false,
  pill_extras_layout: 'right',
  language: 'en',
};

vi.mock('@/components/AudioDots', () => ({
  AudioDots: () => <div data-testid="audio-dots" />
}));

vi.mock('@/hooks/useRecording', () => ({
  useRecording: () => mockRecording
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSetting: (key: string) => mockSettings[key]
}));

// Captures every event handler `RecordingPill` registers, keyed by event name,
// so individual tests can fire backend events synchronously.
const eventHandlers: Record<string, Array<(event: { payload: unknown }) => void>> = {};

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
    if (!eventHandlers[event]) eventHandlers[event] = [];
    eventHandlers[event].push(handler);
    return () => {
      eventHandlers[event] = eventHandlers[event].filter((fn) => fn !== handler);
    };
  })
}));

vi.mock('@tauri-apps/api/core', () => ({
  // Spec 003 replaced `get_enhancement_options { preset }` with
  // `get_active_prompt { id, name, ... }`. The pill seeds its label from
  // this response on mount.
  invoke: vi.fn().mockResolvedValue({
    id: 'builtin:default',
    name: 'Default',
    icon: 'FileText',
    prompt_text: '',
    kind: 'builtin',
  })
}));

const flushAsync = () => act(() => Promise.resolve());

const fireEvent = async (name: string, payload: unknown) => {
  const handlers = eventHandlers[name] ?? [];
  await act(async () => {
    handlers.forEach((handler) => handler({ payload }));
  });
};

describe('RecordingPill', () => {
  beforeEach(() => {
    mockRecording.state = 'idle';
    mockSettings.pill_indicator_mode = 'when_recording';
    mockSettings.pill_show_preset = false;
    mockSettings.pill_show_language = false;
    mockSettings.pill_extras_layout = 'right';
    mockSettings.language = 'en';
    Object.keys(eventHandlers).forEach((key) => {
      eventHandlers[key] = [];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the pill when mode is never', () => {
    mockSettings.pill_indicator_mode = 'never';
    render(<RecordingPill />);
    expect(screen.queryByTestId('audio-dots')).not.toBeInTheDocument();
  });

  it('hides the pill when idle and mode is when_recording', () => {
    mockSettings.pill_indicator_mode = 'when_recording';
    mockRecording.state = 'idle';
    render(<RecordingPill />);
    expect(screen.queryByTestId('audio-dots')).not.toBeInTheDocument();
  });

  it('shows the pill when recording and mode is when_recording', () => {
    mockSettings.pill_indicator_mode = 'when_recording';
    mockRecording.state = 'recording';
    render(<RecordingPill />);
    expect(screen.getByTestId('audio-dots')).toBeInTheDocument();
  });

  it('shows the pill when idle and mode is always', () => {
    mockSettings.pill_indicator_mode = 'always';
    mockRecording.state = 'idle';
    render(<RecordingPill />);
    expect(screen.getByTestId('audio-dots')).toBeInTheDocument();
  });

  it('does not render the preset label when pill_show_preset is false', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = false;
    render(<RecordingPill />);
    await flushAsync();
    expect(screen.queryByTestId('pill-preset-label')).not.toBeInTheDocument();
  });

  it('renders the preset label when pill_show_preset is true and updates on active-prompt-changed', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = true;
    render(<RecordingPill />);
    // Wait for the seeded `get_active_prompt` invoke to resolve.
    await flushAsync();
    expect(screen.getByTestId('pill-preset-label')).toHaveTextContent('Default');

    await fireEvent('active-prompt-changed', { id: 'builtin:email', label: 'Email' });
    expect(screen.getByTestId('pill-preset-label')).toHaveTextContent('Email');
  });

  it('flashes the pill for ~1500ms when mode is never and a cycle event fires', async () => {
    mockSettings.pill_indicator_mode = 'never';
    mockSettings.pill_show_preset = true;

    // Switch to fake timers BEFORE rendering so the `setTimeout` inside the
    // forceShow logic is scheduled on the fake clock (otherwise the timer is
    // queued on the real clock and `vi.advanceTimersByTime` cannot clear it).
    vi.useFakeTimers();
    render(<RecordingPill />);
    // Let the seeded `get_active_prompt` invoke and the `listen()`
    // registrations settle before we fire any backend events. Both resolve
    // via microtasks, so flush the microtask queue under fake timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId('audio-dots')).not.toBeInTheDocument();

    await fireEvent('active-prompt-changed', { id: 'builtin:prompts', label: 'Prompts' });
    expect(screen.getByTestId('audio-dots')).toBeInTheDocument();
    expect(screen.getByTestId('pill-preset-label')).toHaveTextContent('Prompts');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.queryByTestId('audio-dots')).not.toBeInTheDocument();
  });

  // ---- spec 002 — US2 (T033) ---------------------------------------------

  it('does not render the language label when pill_show_language is false', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_language = false;
    render(<RecordingPill />);
    await flushAsync();
    expect(screen.queryByTestId('pill-language-label')).not.toBeInTheDocument();
  });

  it('renders the language label when pill_show_language is true and updates on active-language-changed', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_language = true;
    mockSettings.language = 'en';
    render(<RecordingPill />);
    await flushAsync();
    expect(screen.getByTestId('pill-language-label')).toHaveTextContent('en');

    await fireEvent('active-language-changed', { language: 'de' });
    expect(screen.getByTestId('pill-language-label')).toHaveTextContent('de');
  });

  it('updates the language label on the existing language-changed event (model-fallback path)', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_language = true;
    mockSettings.language = 'de';
    render(<RecordingPill />);
    await flushAsync();
    expect(screen.getByTestId('pill-language-label')).toHaveTextContent('de');

    // The model-driven fallback path emits `language-changed` with a string
    // payload (the new ISO code), unlike the cycle-driven path which uses
    // `{ language: <code> }`. The pill must handle both.
    await fireEvent('language-changed', 'en');
    expect(screen.getByTestId('pill-language-label')).toHaveTextContent('en');
  });

  it('renders language and preset as separate bubbles in order [lang] [preset] when both are visible', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = true;
    mockSettings.pill_show_language = true;
    mockSettings.language = 'de';

    render(<RecordingPill />);
    await flushAsync();

    const language = screen.getByTestId('pill-language-label');
    const preset = screen.getByTestId('pill-preset-label');

    expect(language).toHaveTextContent('de');
    expect(preset).toHaveTextContent('Default');

    const languageBubble = screen.getByTestId('pill-language-bubble');
    const presetBubble = screen.getByTestId('pill-preset-bubble');
    expect(languageBubble).not.toBe(presetBubble);
    expect(
      languageBubble.compareDocumentPosition(presetBubble) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // ---- spec 002 — US3 (T038) ---------------------------------------------

  it('renders three bubbles inline in order [dots] [lang] [preset] when pill_extras_layout = "right"', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = true;
    mockSettings.pill_show_language = true;
    mockSettings.language = 'de';
    mockSettings.pill_extras_layout = 'right';

    render(<RecordingPill />);
    await flushAsync();

    const container = screen.getByTestId('pill-container');
    expect(container).toHaveAttribute('data-extras-layout', 'right');
    expect(container.className).toMatch(/flex-row/);
    expect(container.className).not.toMatch(/flex-col/);

    const dotsBubble = screen.getByTestId('pill-dots-bubble');
    const languageBubble = screen.getByTestId('pill-language-bubble');
    const presetBubble = screen.getByTestId('pill-preset-bubble');

    const order = [dotsBubble, languageBubble, presetBubble];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('stacks three bubbles vertically in order [dots] [lang] [preset] when pill_extras_layout = "below"', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = true;
    mockSettings.pill_show_language = true;
    mockSettings.language = 'de';
    mockSettings.pill_extras_layout = 'below';

    render(<RecordingPill />);
    await flushAsync();

    const container = screen.getByTestId('pill-container');
    expect(container).toHaveAttribute('data-extras-layout', 'below');
    expect(container.className).toMatch(/flex-col/);
    expect(container.className).not.toMatch(/flex-row\b/);

    const dotsBubble = screen.getByTestId('pill-dots-bubble');
    const languageBubble = screen.getByTestId('pill-language-bubble');
    const presetBubble = screen.getByTestId('pill-preset-bubble');

    const order = [dotsBubble, languageBubble, presetBubble];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('renders preset-only as its own bubble (no language bubble) under both layouts', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = true;
    mockSettings.pill_show_language = false;

    for (const layout of ['right', 'below'] as const) {
      mockSettings.pill_extras_layout = layout;
      const { unmount } = render(<RecordingPill />);
      await flushAsync();
      expect(screen.getByTestId('pill-preset-bubble')).toBeInTheDocument();
      expect(
        screen.queryByTestId('pill-language-bubble'),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('renders language-only as its own bubble (no preset bubble) under both layouts', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = false;
    mockSettings.pill_show_language = true;

    for (const layout of ['right', 'below'] as const) {
      mockSettings.pill_extras_layout = layout;
      const { unmount } = render(<RecordingPill />);
      await flushAsync();
      expect(screen.getByTestId('pill-language-bubble')).toBeInTheDocument();
      expect(
        screen.queryByTestId('pill-preset-bubble'),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('renders only the dots bubble when both extras toggles are off, regardless of layout', async () => {
    mockSettings.pill_indicator_mode = 'always';
    mockSettings.pill_show_preset = false;
    mockSettings.pill_show_language = false;

    for (const layout of ['right', 'below'] as const) {
      mockSettings.pill_extras_layout = layout;
      const { unmount } = render(<RecordingPill />);
      await flushAsync();
      expect(screen.getByTestId('pill-dots-bubble')).toBeInTheDocument();
      expect(
        screen.queryByTestId('pill-language-bubble'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('pill-preset-bubble'),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
