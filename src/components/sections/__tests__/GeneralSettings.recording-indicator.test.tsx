import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSettings } from '../GeneralSettings';

const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);
const baseSettings = {
  recording_mode: 'toggle',
  hotkey: 'CommandOrControl+Shift+Space',
  ptt_hotkey: 'Alt+Space',
  cycle_preset_hotkey: '',
  cycle_language_hotkey: '',
  keep_transcription_in_clipboard: false,
  play_sound_on_recording: true,
  pill_indicator_mode: 'when_recording',
  pill_indicator_position: 'bottom-center',
  pill_indicator_offset: 10,
  pill_show_preset: false,
  pill_show_language: false,
  pill_extras_layout: 'right'
};

let mockSettings = { ...baseSettings };

// Toast mock so the conflict path can be observed.
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: vi.fn(),
  },
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings
  })
}));

vi.mock('@/contexts/ReadinessContext', () => ({
  useCanAutoInsert: () => true
}));

vi.mock('@/lib/platform', () => ({
  isMacOS: false
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false)
}));

// HotkeyInput registry: GeneralSettings renders multiple HotkeyInput
// components. Tests need to (a) read each one's current `value` prop, and
// (b) call its `onChange` handler to exercise the conflict-detection logic.
// Since GeneralSettings re-renders during effects (e.g. autostart probe),
// the same logical row is mounted multiple times — so we always store the
// LATEST props per role.
type HotkeyInputProps = {
  value: string;
  onChange: (value: string) => Promise<void> | void;
  placeholder?: string;
};
// Map from human-meaningful name → latest captured props.
const hotkeyInputByName = new Map<string, HotkeyInputProps>();
// Per-render counter so we can map renders to their stable role by render
// order. Reset every time React begins a new render of `GeneralSettings`.
let hotkeyRenderIndex = 0;

// The render order of HotkeyInputs inside `GeneralSettings`:
//   0 → recording / toggle hotkey
//   1 → cycle-preset hotkey
//   2 → cycle-language hotkey
// (The optional PTT row is currently commented out in the source.)
const HOTKEY_ORDER = ['recording', 'cycle-preset', 'cycle-language'] as const;

vi.mock('@/components/HotkeyInput', () => ({
  HotkeyInput: (props: HotkeyInputProps) => {
    // React schedules each render in a single microtask burst — we use the
    // microtask tick (a monotonically increasing performance.now value) to
    // detect "this is the start of a fresh render" so the order index resets.
    // Falling back to a counter is safer in jsdom though, so we just reset
    // when the index would go past the end.
    if (hotkeyRenderIndex >= HOTKEY_ORDER.length) {
      hotkeyRenderIndex = 0;
    }
    const name = HOTKEY_ORDER[hotkeyRenderIndex] ?? `unknown-${hotkeyRenderIndex}`;
    hotkeyRenderIndex += 1;
    hotkeyInputByName.set(name, props);
    return (
      <div
        data-testid={`hotkey-input-${name}`}
        data-value={props.value}
        data-placeholder={props.placeholder ?? ''}
      />
    );
  }
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: any }) => <div>{children}</div>
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
    disabled,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid={id ? `switch-${id}` : 'switch'}
      data-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    />
  )
}));

// ToggleGroup mock: rather than reproducing Radix's context, we shallow-clone
// the parent's `value` / `onValueChange` props onto each `ToggleGroupItem`
// child via `cloneElement`. That keeps each group's item set isolated even
// when several groups co-exist on the page (e.g. Recording Mode + the new
// "Indicator extras layout" row).
vi.mock('@/components/ui/toggle-group', async () => {
  const ReactImport = await import('react');
  type ItemProps = {
    value: string;
    children: any;
    __groupId?: string;
    __groupValue?: string;
    __onValueChange?: (value: string) => void;
  };
  return {
    ToggleGroup: ({
      id,
      value,
      onValueChange,
      children,
    }: {
      id?: string;
      value?: string;
      onValueChange?: (value: string) => void;
      children: any;
    }) => {
      const wrapped = ReactImport.Children.map(children, (child: any) => {
        if (!ReactImport.isValidElement(child)) return child;
        return ReactImport.cloneElement(child, {
          __groupId: id,
          __groupValue: value,
          __onValueChange: onValueChange,
        } as Partial<ItemProps>);
      });
      return (
        <div
          data-testid={id ? `toggle-group-${id}` : 'toggle-group'}
          data-value={value ?? ''}
        >
          {wrapped}
        </div>
      );
    },
    ToggleGroupItem: ({
      value,
      children,
      __groupId,
      __groupValue,
      __onValueChange,
    }: ItemProps) => (
      <button
        type="button"
        data-testid={
          __groupId
            ? `toggle-item-${__groupId}-${value}`
            : `toggle-item-${value}`
        }
        data-active={__groupValue === value ? 'true' : 'false'}
        onClick={() => __onValueChange?.(value)}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: any; value?: string; onValueChange?: (v: string) => void }) => (
    <div data-testid="select" data-value={value} onClick={() => onValueChange?.('top-center')}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: any }) => <div data-testid="select-trigger">{children}</div>,
  SelectContent: ({ children }: { children: any }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: any; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
  SelectValue: () => <div data-testid="select-value" />
}));

vi.mock('@/components/MicrophoneSelection', () => ({
  MicrophoneSelection: () => <div data-testid="microphone-selection" />
}));

describe('GeneralSettings recording indicator', () => {
  beforeEach(() => {
    mockSettings = { ...baseSettings };
    hotkeyInputByName.clear();
    hotkeyRenderIndex = 0;
    toastError.mockClear();
    toastSuccess.mockClear();
    vi.clearAllMocks();
  });

  it('hides the position selector when mode is never', async () => {
    mockSettings.pill_indicator_mode = 'never';
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(
        screen.queryByText('Indicator Position')
      ).not.toBeInTheDocument();
    });
  });

  it('shows the position selector when mode is always', async () => {
    mockSettings.pill_indicator_mode = 'always';
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText('Indicator Position')).toBeInTheDocument();
    });
  });

  it('calls updateSettings when position is changed', async () => {
    mockSettings.pill_indicator_mode = 'always';
    render(<GeneralSettings />);
    
    await waitFor(() => {
      expect(screen.getByText('Indicator Position')).toBeInTheDocument();
    });

    // Find the position select (second select on the page, after visibility mode)
    const selects = screen.getAllByTestId('select');
    const positionSelect = selects.find(s => s.getAttribute('data-value')?.includes('center'));
    
    if (positionSelect) {
      fireEvent.click(positionSelect);
      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          pill_indicator_position: 'top-center'
        });
      });
    }
  });

  // ---- spec 002 — US1 (T018) ---------------------------------------------

  it('renders the "Cycle preset hotkey" row with the persisted default', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Cycle preset hotkey')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Cycle Default → Prompts → Email → Commit')
    ).toBeInTheDocument();

    const cyclePresetInput = screen.getByTestId('hotkey-input-cycle-preset');
    expect(cyclePresetInput).toHaveAttribute('data-value', '');
    expect(cyclePresetInput).toHaveAttribute('data-placeholder', 'Click to set');
  });

  it('renders the "Show preset on overlay" toggle reflecting the persisted state', async () => {
    mockSettings.pill_show_preset = true;
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Show preset on overlay')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Display the active formatting preset on the recording pill'
      )
    ).toBeInTheDocument();

    const toggle = screen.getByTestId('switch-pill-show-preset');
    expect(toggle).toHaveAttribute('data-checked', 'true');

    // Flipping the toggle persists the new value via updateSettings.
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pill_show_preset: false,
    });
  });

  it('renders the "Show preset on overlay" toggle as off by default', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Show preset on overlay')).toBeInTheDocument();
    });
    const toggle = screen.getByTestId('switch-pill-show-preset');
    expect(toggle).toHaveAttribute('data-checked', 'false');
  });

  it('rejects a cycle-preset hotkey that conflicts with the recording hotkey', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('hotkey-input-cycle-preset')).toBeInTheDocument();
    });

    const cyclePresetInstance = hotkeyInputByName.get('cycle-preset');
    expect(cyclePresetInstance).toBeDefined();

    // Attempt to bind the cycle-preset hotkey to the same combo as the
    // recording hotkey — `findUserHotkeyConflict` should flag the collision.
    await act(async () => {
      await cyclePresetInstance!.onChange('CommandOrControl+Shift+Space');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/recording hotkey/i);
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycle_preset_hotkey: expect.anything() })
    );
  });

  it('rejects a cycle-preset hotkey that conflicts with the push-to-talk hotkey', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('hotkey-input-cycle-preset')).toBeInTheDocument();
    });

    const cyclePresetInstance = hotkeyInputByName.get('cycle-preset');
    expect(cyclePresetInstance).toBeDefined();

    await act(async () => {
      await cyclePresetInstance!.onChange('Alt+Space');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/push-to-talk hotkey/i);
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycle_preset_hotkey: expect.anything() })
    );
  });

  it('persists a non-conflicting cycle-preset hotkey via updateSettings', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('hotkey-input-cycle-preset')).toBeInTheDocument();
    });

    const cyclePresetInstance = hotkeyInputByName.get('cycle-preset');
    expect(cyclePresetInstance).toBeDefined();

    await act(async () => {
      await cyclePresetInstance!.onChange('CommandOrControl+Shift+P');
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      cycle_preset_hotkey: 'CommandOrControl+Shift+P',
    });
  });

  // ---- spec 002 — US2 (T032) ---------------------------------------------

  it('renders the "Cycle language hotkey" row with the persisted default', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Cycle language hotkey')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Cycle through enabled spoken languages'),
    ).toBeInTheDocument();

    const cycleLanguageInput = screen.getByTestId(
      'hotkey-input-cycle-language',
    );
    expect(cycleLanguageInput).toHaveAttribute('data-value', '');
    expect(cycleLanguageInput).toHaveAttribute('data-placeholder', 'Click to set');
  });

  it('renders the "Show language on overlay" toggle reflecting the persisted state', async () => {
    mockSettings.pill_show_language = true;
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Show language on overlay')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Display the active spoken-language ISO code on the\s+recording pill/,
      ),
    ).toBeInTheDocument();

    const toggle = screen.getByTestId('switch-pill-show-language');
    expect(toggle).toHaveAttribute('data-checked', 'true');

    // Flipping the toggle persists the negated value.
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pill_show_language: false,
    });
  });

  it('renders the "Show language on overlay" toggle as off by default', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Show language on overlay')).toBeInTheDocument();
    });
    const toggle = screen.getByTestId('switch-pill-show-language');
    expect(toggle).toHaveAttribute('data-checked', 'false');
  });

  it('rejects a cycle-language hotkey that conflicts with the recording hotkey', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hotkey-input-cycle-language'),
      ).toBeInTheDocument();
    });

    const cycleLanguageInstance = hotkeyInputByName.get('cycle-language');
    expect(cycleLanguageInstance).toBeDefined();

    await act(async () => {
      await cycleLanguageInstance!.onChange('CommandOrControl+Shift+Space');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/recording hotkey/i);
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycle_language_hotkey: expect.anything() }),
    );
  });

  it('rejects a cycle-language hotkey that conflicts with the push-to-talk hotkey', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hotkey-input-cycle-language'),
      ).toBeInTheDocument();
    });

    const cycleLanguageInstance = hotkeyInputByName.get('cycle-language');
    expect(cycleLanguageInstance).toBeDefined();

    await act(async () => {
      await cycleLanguageInstance!.onChange('Alt+Space');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/push-to-talk hotkey/i);
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycle_language_hotkey: expect.anything() }),
    );
  });

  it('rejects a cycle-language hotkey that conflicts with the cycle-preset hotkey', async () => {
    mockSettings.cycle_preset_hotkey = 'CommandOrControl+Shift+P';
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hotkey-input-cycle-language'),
      ).toBeInTheDocument();
    });

    const cycleLanguageInstance = hotkeyInputByName.get('cycle-language');
    expect(cycleLanguageInstance).toBeDefined();

    await act(async () => {
      await cycleLanguageInstance!.onChange('CommandOrControl+Shift+P');
    });

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/cycle preset hotkey/i);
    expect(mockUpdateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ cycle_language_hotkey: expect.anything() }),
    );
  });

  it('persists a non-conflicting cycle-language hotkey via updateSettings', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hotkey-input-cycle-language'),
      ).toBeInTheDocument();
    });

    const cycleLanguageInstance = hotkeyInputByName.get('cycle-language');
    expect(cycleLanguageInstance).toBeDefined();

    await act(async () => {
      await cycleLanguageInstance!.onChange('CommandOrControl+Shift+L');
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      cycle_language_hotkey: 'CommandOrControl+Shift+L',
    });
  });

  // ---- spec 002 — US3 (T039) ---------------------------------------------

  it('renders the "Indicator extras layout" radio with "right" as the default', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(screen.getByText('Indicator extras layout')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Where the preset and language labels appear on the pill',
      ),
    ).toBeInTheDocument();

    const group = screen.getByTestId('toggle-group-pill-extras-layout');
    expect(group).toHaveAttribute('data-value', 'right');

    const rightItem = screen.getByTestId(
      'toggle-item-pill-extras-layout-right',
    );
    const belowItem = screen.getByTestId(
      'toggle-item-pill-extras-layout-below',
    );
    expect(rightItem).toHaveAttribute('data-active', 'true');
    expect(belowItem).toHaveAttribute('data-active', 'false');
  });

  it('writes pill_extras_layout when switching from "right" to "below"', async () => {
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('toggle-item-pill-extras-layout-below'),
      ).toBeInTheDocument();
    });

    const belowItem = screen.getByTestId(
      'toggle-item-pill-extras-layout-below',
    );
    await act(async () => {
      fireEvent.click(belowItem);
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pill_extras_layout: 'below',
    });
  });

  it('reflects the persisted "below" layout', async () => {
    mockSettings.pill_extras_layout = 'below';
    render(<GeneralSettings />);

    await waitFor(() => {
      expect(
        screen.getByTestId('toggle-group-pill-extras-layout'),
      ).toBeInTheDocument();
    });

    const group = screen.getByTestId('toggle-group-pill-extras-layout');
    expect(group).toHaveAttribute('data-value', 'below');
    expect(
      screen.getByTestId('toggle-item-pill-extras-layout-below'),
    ).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByTestId('toggle-item-pill-extras-layout-right'),
    ).toHaveAttribute('data-active', 'false');
  });
});
