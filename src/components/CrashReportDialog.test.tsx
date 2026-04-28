import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashReportDialog } from './CrashReportDialog';
import { gatherCrashReportData, submitCrashReport } from '@/utils/crashReport';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/utils/crashReport', () => ({
  gatherCrashReportData: vi.fn(),
  submitCrashReport: vi.fn(),
}));

const crashData = {
  errorMessage: 'Cannot read properties of undefined',
  errorStack: 'Error stack',
  componentStack: 'Component stack',
  appVersion: '1.0.0',
  platform: 'macos',
  osVersion: '15.0',
  architecture: 'aarch64',
  currentModel: 'base.en',
  deviceId: 'device-123',
  timestamp: '2026-04-28T00:00:00.000Z',
  logFileName: 'voicetypr-2026-04-28.log',
  logContent: 'INFO log line',
  logTruncated: false,
  logStatusNote: '',
};

describe('CrashReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gatherCrashReportData).mockResolvedValue(crashData);
    vi.mocked(submitCrashReport).mockResolvedValue({ success: true, message: 'Report submitted' });
  });

  it('does not show copy fallback before a submit failure', async () => {
    render(<CrashReportDialog error={new Error('Boom')} isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Cannot read properties of undefined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy details/i })).not.toBeInTheDocument();
  });

  it('submits gathered crash data directly to support', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const error = new Error('Cannot read properties of undefined');

    render(<CrashReportDialog error={error} isOpen onClose={onClose} />);

    expect(await screen.findByText('Cannot read properties of undefined')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(submitCrashReport).toHaveBeenCalledWith(crashData);
    });
    expect(toast.success).toHaveBeenCalledWith('Crash report submitted. Thank you.');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open when crash submit fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(gatherCrashReportData).mockResolvedValueOnce({
      ...crashData,
      errorMessage: 'Boom',
    });
    vi.mocked(submitCrashReport).mockResolvedValueOnce({
      success: false,
      message: 'Too many reports. Please try again later.',
    });

    render(<CrashReportDialog error={new Error('Boom')} isOpen onClose={onClose} />);

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy details/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Too many reports. Please try again later.');
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /copy details/i })).toBeEnabled();
    expect(screen.getByText(/copy the crash details/i)).toBeInTheDocument();
  });

  it('preserves Try Again behavior', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <CrashReportDialog
        error={new Error('Boom')}
        isOpen
        onClose={vi.fn()}
        onRetry={onRetry}
      />
    );

    expect(await screen.findByText('Cannot read properties of undefined')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalled();
  });
});
