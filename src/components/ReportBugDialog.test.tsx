import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { ReportBugDialog } from './ReportBugDialog';
import { gatherManualReportData, buildReportBody } from '@/utils/crashReport';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: { current_model: 'base.en' },
  }),
}));

vi.mock('@/utils/crashReport', () => ({
  gatherManualReportData: vi.fn(),
  buildReportBody: vi.fn(),
}));

let writeTextMock: MockInstance<(data: string) => Promise<void>>;

describe('ReportBugDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gatherManualReportData).mockResolvedValue({
      message: 'The app broke',
      appVersion: '1.0.0',
      platform: 'macos',
      osVersion: '15.0',
      architecture: 'aarch64',
      currentModel: 'base.en',
      deviceId: 'device-123',
      timestamp: '2026-04-27T00:00:00.000Z',
      logFileName: 'voicetypr-2026-04-27.log',
      logContent: 'INFO log line',
      logTruncated: false,
      logStatusNote: '',
    });
    vi.mocked(buildReportBody).mockReturnValue('REPORT BODY with The app broke');
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    }
    writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('requires a message before opening an email draft', async () => {
    const user = userEvent.setup();

    render(<ReportBugDialog isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /email support/i }));

    expect(screen.getByText(/please describe the issue/i)).toBeInTheDocument();
    expect(gatherManualReportData).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/message/i)).toHaveAttribute('aria-required', 'true');
  });

  it('opens an email addressed to support with the generated report body', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ReportBugDialog isOpen onClose={onClose} />);

    await user.type(screen.getByLabelText(/name/i), 'Moin');
    await user.type(screen.getByLabelText(/email/i), 'moin@example.com');
    await user.type(screen.getByLabelText(/message/i), 'The app broke');
    await user.click(screen.getByRole('button', { name: /email support/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(1);
    });
    expect(gatherManualReportData).toHaveBeenCalledWith(
      'Moin',
      'moin@example.com',
      'The app broke',
      'base.en'
    );
    expect(String(vi.mocked(open).mock.calls[0][0])).toContain('mailto:support@voicetypr.com');
    expect(String(vi.mocked(open).mock.calls[0][0])).toContain(encodeURIComponent('REPORT BODY with The app broke'));
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the generated report body and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ReportBugDialog isOpen onClose={onClose} />);

    await user.type(screen.getByLabelText(/message/i), 'Copy this report');
    expect(screen.getByLabelText(/message/i)).toHaveValue('Copy this report');
    await user.click(screen.getByRole('button', { name: /copy report/i }));
    await waitFor(() => {
      expect(gatherManualReportData).toHaveBeenCalled();
    });
    expect(buildReportBody).toHaveBeenCalled();

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('REPORT BODY with The app broke');
    });
    expect(onClose).not.toHaveBeenCalled();
  });



  it('does not open an email draft when the log-omitted body is still too long', async () => {
    const user = userEvent.setup();
    vi.mocked(buildReportBody).mockReturnValue('x'.repeat(8_100));

    render(<ReportBugDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/message/i), 'A very long issue report');
    await user.click(screen.getByRole('button', { name: /email support/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'This report is too long for an email draft. Please shorten your message or use Copy Report.'
      );
    });
    expect(open).not.toHaveBeenCalled();
  });


  it('still builds a report when the latest log is unavailable', async () => {
    const user = userEvent.setup();
    vi.mocked(gatherManualReportData).mockResolvedValueOnce({
      message: 'No log case',
      appVersion: '1.0.0',
      platform: 'macos',
      osVersion: '15.0',
      architecture: 'aarch64',
      currentModel: 'base.en',
      deviceId: 'device-123',
      timestamp: '2026-04-27T00:00:00.000Z',
      logFileName: null,
      logContent: '',
      logTruncated: false,
      logStatusNote: 'No log file found.',
    });

    render(<ReportBugDialog isOpen onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/message/i), 'No log case');
    await user.click(screen.getByRole('button', { name: /email support/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(1);
    });
    expect(buildReportBody).toHaveBeenCalledWith(expect.objectContaining({
      logFileName: null,
      logStatusNote: 'No log file found.',
    }));
  });
});
