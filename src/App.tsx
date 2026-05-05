import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { AppContainer } from "./components/AppContainer";
import { LicenseProvider } from "./contexts/LicenseContext";
import { ReadinessProvider } from "./contexts/ReadinessContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ModelManagementProvider } from "./contexts/ModelManagementContext";

type CycleLanguageNoopReason = "english_only_model" | "single_language";

interface CycleLanguageNoopPayload {
  reason: CycleLanguageNoopReason;
}

/**
 * Top-level listener for the `cycle-language-noop` event (spec 002 — US2).
 * The cycle hotkey is gated under two conditions; we surface a non-disruptive
 * toast for each so the user knows why the cycle didn't advance.
 */
function CycleLanguageNoopToast() {
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    listen<CycleLanguageNoopPayload>("cycle-language-noop", (event) => {
      if (!isMounted) return;
      const reason = event.payload?.reason;
      if (reason === "english_only_model") {
        toast.info(
          "Active model is English-only — switch model in Models to use other languages.",
        );
      } else if (reason === "single_language") {
        toast.info("Only one language enabled — add more in Models.");
      }
    }).then((unlisten) => {
      if (!isMounted) {
        unlisten();
        return;
      }
      unlistenFn = unlisten;
    });

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <LicenseProvider>
        <SettingsProvider>
          <ReadinessProvider>
            <ModelManagementProvider>
              <AppContainer />
              <CycleLanguageNoopToast />
              <Toaster position="top-center" />
            </ModelManagementProvider>
          </ReadinessProvider>
        </SettingsProvider>
      </LicenseProvider>
    </AppErrorBoundary>
  );
}
