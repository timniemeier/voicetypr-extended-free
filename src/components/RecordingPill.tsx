import { AudioDots } from "@/components/AudioDots";
import { useSetting } from "@/contexts/SettingsContext";
import { useRecording } from "@/hooks/useRecording";
import { PillExtrasLayout, PillIndicatorMode } from "@/types";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type PillState = "idle" | "listening" | "transcribing" | "formatting";
type EnhancementPreset = "Default" | "Prompts" | "Email" | "Commit";

// Duration of the "flash" the overlay does when a cycle event arrives while
// `pill_indicator_mode === "never"`. Per spec FR-008 + SC-004 the pill should
// briefly surface the new state, then auto-hide; the user's persisted
// `pill_indicator_mode` is never mutated.
const FORCE_SHOW_DURATION_MS = 1500;

export function RecordingPill() {
  const recording = useRecording();
  const [audioLevel, setAudioLevel] = useState(0);
  const [isFormatting, setIsFormatting] = useState(false);

  // Setting: pill indicator mode (default: "when_recording")
  const pillIndicatorMode: PillIndicatorMode = useSetting("pill_indicator_mode") ?? "when_recording";
  const pillShowPreset = useSetting("pill_show_preset") ?? false;
  const pillShowLanguage = useSetting("pill_show_language") ?? false;
  const pillExtrasLayout: PillExtrasLayout =
    useSetting("pill_extras_layout") ?? "right";
  const settingsLanguage = useSetting("language") ?? "en";

  const [activePreset, setActivePreset] = useState<EnhancementPreset>("Default");
  const [activeLanguage, setActiveLanguage] = useState<string>(settingsLanguage);
  const [forceShow, setForceShow] = useState(false);
  const forceShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the local language label in sync with the persisted active language
  // when the user changes it via the Models UI (no event is emitted in that
  // path, but `useSetting("language")` re-renders us when the settings store
  // refreshes). We only fall back to this when no cycle event has yet fired.
  useEffect(() => {
    setActiveLanguage(settingsLanguage);
  }, [settingsLanguage]);

  // Determine pill state
  const getPillState = (): PillState => {
    if (isFormatting) return "formatting";
    if (recording.state === "recording") return "listening";
    if (recording.state === "transcribing" || recording.state === "stopping")
      return "transcribing";
    return "idle";
  };

  const pillState = getPillState();
  const isListening = pillState === "listening";
  const isActive = pillState !== "idle";

  // Listen for audio level events
  useEffect(() => {
    if (isListening) {
      let isMounted = true;
      let unlistenFn: (() => void) | undefined;

      listen<number>("audio-level", (event) => {
        if (isMounted) setAudioLevel(event.payload);
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
        setAudioLevel(0);
      };
    } else {
      const timeoutId = setTimeout(() => setAudioLevel(0), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isListening]);

  // Listen for formatting/enhancement events (global events from backend)
  useEffect(() => {
    let isMounted = true;
    const unlistenFns: (() => void)[] = [];

    const events = [
      { name: "enhancing-started", handler: () => {
        if (isMounted) setIsFormatting(true);
      }},
      { name: "enhancing-completed", handler: () => {
        if (isMounted) setIsFormatting(false);
      }},
      { name: "enhancing-failed", handler: () => {
        if (isMounted) setIsFormatting(false);
      }},
    ];

    events.forEach(({ name, handler }) => {
      listen(name, handler).then((unlisten) => {
        if (!isMounted) {
          unlisten();
          return;
        }
        unlistenFns.push(unlisten);
      });
    });

    return () => {
      isMounted = false;
      unlistenFns.forEach((fn) => fn());
    };
  }, []);

  // Seed the active preset on mount so the label is correct before the first
  // cycle event arrives. Uses the same source of truth as the Enhancements UI
  // (the `ai` store via `get_enhancement_options`).
  useEffect(() => {
    let cancelled = false;
    invoke<{ preset: EnhancementPreset }>("get_enhancement_options")
      .then((options) => {
        if (!cancelled && options?.preset) {
          setActivePreset(options.preset);
        }
      })
      .catch(() => {
        // Silent: the label simply stays at the current default until a
        // cycle event arrives.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for cycle events. On every emission, update the local state and
  // (if pill_indicator_mode === "never") flash the pill for
  // FORCE_SHOW_DURATION_MS ms so the user sees what they just changed.
  // Covers: preset cycle, language cycle, the model-fallback `language-changed`
  // event, and the `cycle-language-noop` gate (so the user still sees the
  // current state on a gated press — FR-008, SC-004).
  useEffect(() => {
    let isMounted = true;
    const unlistenFns: (() => void)[] = [];

    const flash = () => {
      if (pillIndicatorMode !== "never") return;
      if (forceShowTimerRef.current) {
        clearTimeout(forceShowTimerRef.current);
      }
      setForceShow(true);
      forceShowTimerRef.current = setTimeout(() => {
        setForceShow(false);
        forceShowTimerRef.current = null;
      }, FORCE_SHOW_DURATION_MS);
    };

    const subscriptions: Array<Promise<() => void>> = [
      listen<{ preset: EnhancementPreset }>("active-preset-changed", (event) => {
        if (!isMounted) return;
        if (event.payload?.preset) {
          setActivePreset(event.payload.preset);
        }
        flash();
      }),
      listen<{ language: string }>("active-language-changed", (event) => {
        if (!isMounted) return;
        if (event.payload?.language) {
          setActiveLanguage(event.payload.language);
        }
        flash();
      }),
      // Existing event from the model-driven English-fallback path. The
      // payload shape used historically is `string` (the new ISO code).
      listen<string>("language-changed", (event) => {
        if (!isMounted) return;
        if (typeof event.payload === "string" && event.payload.length > 0) {
          setActiveLanguage(event.payload);
        }
        flash();
      }),
      // No-op gate: the user pressed cycle but it couldn't advance (single
      // language enabled, or English-only model). Still flash the pill so
      // the user sees the current state under `mode === "never"`.
      listen<{ reason: string }>("cycle-language-noop", () => {
        if (!isMounted) return;
        flash();
      }),
    ];

    subscriptions.forEach((promise) => {
      promise.then((unlisten) => {
        if (!isMounted) {
          unlisten();
          return;
        }
        unlistenFns.push(unlisten);
      });
    });

    return () => {
      isMounted = false;
      unlistenFns.forEach((fn) => fn());
      if (forceShowTimerRef.current) {
        clearTimeout(forceShowTimerRef.current);
        forceShowTimerRef.current = null;
      }
    };
  }, [pillIndicatorMode]);

  // Visibility predicate (per research.md R-005):
  //   mode !== "never" || pillState !== "idle" || forceShow
  const shouldHide =
    pillIndicatorMode === "never"
      ? !forceShow
      : pillIndicatorMode === "when_recording" && pillState === "idle";

  if (shouldHide) {
    return null;
  }

  const useBelowLayout = pillExtrasLayout === "below";

  const bubbleBase =
    "rounded-full select-none bg-black shadow-lg ring-1 ring-white/30 inline-flex items-center justify-center";
  const labelClass =
    "text-[11px] leading-none text-white/90 font-medium tracking-wide whitespace-nowrap";

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={
          useBelowLayout
            ? "flex flex-col items-center gap-1.5"
            : "flex flex-row items-center gap-1.5"
        }
        data-testid="pill-container"
        data-extras-layout={pillExtrasLayout}
      >
        <motion.div
          className={bubbleBase}
          animate={{
            paddingLeft: isActive ? 14 : 10,
            paddingRight: isActive ? 14 : 10,
            paddingTop: isActive ? 7 : 5,
            paddingBottom: isActive ? 7 : 5,
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          data-testid="pill-dots-bubble"
        >
          <AudioDots state={pillState} audioLevel={audioLevel} />
        </motion.div>

        {pillShowLanguage && (
          <div
            className={`${bubbleBase} px-2.5 py-1`}
            data-testid="pill-language-bubble"
          >
            <span className={labelClass} data-testid="pill-language-label">
              {activeLanguage.toLowerCase()}
            </span>
          </div>
        )}

        {pillShowPreset && (
          <div
            className={`${bubbleBase} px-2.5 py-1`}
            data-testid="pill-preset-bubble"
          >
            <span className={labelClass} data-testid="pill-preset-label">
              {activePreset}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
