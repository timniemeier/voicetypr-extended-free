"use client"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown, Circle, Disc } from "lucide-react"
import * as React from "react"

// Languages sorted alphabetically by their display name for better UX
export const languages = [
  { value: "af", label: "Afrikaans" },
  { value: "sq", label: "Albanian" },
  { value: "am", label: "Amharic" },
  { value: "ar", label: "Arabic" },
  { value: "hy", label: "Armenian" },
  { value: "as", label: "Assamese" },
  { value: "az", label: "Azerbaijani" },
  { value: "ba", label: "Bashkir" },
  { value: "eu", label: "Basque" },
  { value: "be", label: "Belarusian" },
  { value: "bn", label: "Bengali" },
  { value: "bs", label: "Bosnian" },
  { value: "br", label: "Breton" },
  { value: "bg", label: "Bulgarian" },
  { value: "yue", label: "Cantonese" },
  { value: "ca", label: "Catalan" },
  { value: "zh", label: "Chinese" },
  { value: "hr", label: "Croatian" },
  { value: "cs", label: "Czech" },
  { value: "da", label: "Danish" },
  { value: "nl", label: "Dutch" },
  { value: "en", label: "English" },
  { value: "et", label: "Estonian" },
  { value: "fo", label: "Faroese" },
  { value: "fi", label: "Finnish" },
  { value: "fr", label: "French" },
  { value: "gl", label: "Galician" },
  { value: "ka", label: "Georgian" },
  { value: "de", label: "German" },
  { value: "el", label: "Greek" },
  { value: "gu", label: "Gujarati" },
  { value: "ht", label: "Haitian Creole" },
  { value: "ha", label: "Hausa" },
  { value: "haw", label: "Hawaiian" },
  { value: "he", label: "Hebrew" },
  { value: "hi", label: "Hindi" },
  { value: "hu", label: "Hungarian" },
  { value: "is", label: "Icelandic" },
  { value: "id", label: "Indonesian" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "jw", label: "Javanese" },
  { value: "kn", label: "Kannada" },
  { value: "kk", label: "Kazakh" },
  { value: "km", label: "Khmer" },
  { value: "ko", label: "Korean" },
  { value: "lo", label: "Lao" },
  { value: "la", label: "Latin" },
  { value: "lv", label: "Latvian" },
  { value: "ln", label: "Lingala" },
  { value: "lt", label: "Lithuanian" },
  { value: "lb", label: "Luxembourgish" },
  { value: "mk", label: "Macedonian" },
  { value: "mg", label: "Malagasy" },
  { value: "ms", label: "Malay" },
  { value: "ml", label: "Malayalam" },
  { value: "mt", label: "Maltese" },
  { value: "mi", label: "Maori" },
  { value: "mr", label: "Marathi" },
  { value: "mn", label: "Mongolian" },
  { value: "my", label: "Myanmar" },
  { value: "ne", label: "Nepali" },
  { value: "no", label: "Norwegian" },
  { value: "nn", label: "Nynorsk" },
  { value: "oc", label: "Occitan" },
  { value: "ps", label: "Pashto" },
  { value: "fa", label: "Persian" },
  { value: "pl", label: "Polish" },
  { value: "pt", label: "Portuguese" },
  { value: "pa", label: "Punjabi" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "sa", label: "Sanskrit" },
  { value: "sr", label: "Serbian" },
  { value: "sn", label: "Shona" },
  { value: "sd", label: "Sindhi" },
  { value: "si", label: "Sinhala" },
  { value: "sk", label: "Slovak" },
  { value: "sl", label: "Slovenian" },
  { value: "so", label: "Somali" },
  { value: "es", label: "Spanish" },
  { value: "su", label: "Sundanese" },
  { value: "sw", label: "Swahili" },
  { value: "sv", label: "Swedish" },
  { value: "tl", label: "Tagalog" },
  { value: "tg", label: "Tajik" },
  { value: "ta", label: "Tamil" },
  { value: "tt", label: "Tatar" },
  { value: "te", label: "Telugu" },
  { value: "th", label: "Thai" },
  { value: "bo", label: "Tibetan" },
  { value: "tr", label: "Turkish" },
  { value: "tk", label: "Turkmen" },
  { value: "uk", label: "Ukrainian" },
  { value: "ur", label: "Urdu" },
  { value: "uz", label: "Uzbek" },
  { value: "vi", label: "Vietnamese" },
  { value: "cy", label: "Welsh" },
  { value: "yi", label: "Yiddish" },
  { value: "yo", label: "Yoruba" },
]

interface LanguageSelectionProps {
  /** Active language ISO 639-1 code (the language used for the next dictation). */
  value: string
  /** Called when the user marks a different enabled entry as the active one. */
  onValueChange: (value: string) => void
  className?: string
  engine?: 'whisper' | 'parakeet' | 'soniox'
  englishOnly?: boolean
  /**
   * Optional ordered list of enabled language codes (spec 002 — US2).
   * When omitted or of length 1, the control behaves like a single-select
   * dropdown — visual SC-003 commitment: zero behaviour change for
   * monolingual users.
   * When length > 1, the popover surfaces a multi-select with a radio-style
   * "active" marker plus a checkmark per enabled entry.
   */
  enabledLanguages?: string[]
  /** Called when the enabled set changes (add/remove). */
  onEnabledChange?: (next: string[]) => void
}

export function LanguageSelection({
  value,
  onValueChange,
  className,
  engine = 'whisper',
  englishOnly = false,
  enabledLanguages,
  onEnabledChange,
}: LanguageSelectionProps) {
  const [open, setOpen] = React.useState(false)

  // Parakeet v3 supports 25 European languages
  const parakeetAllowed = React.useMemo(() => new Set([
    'bg','cs','da','de','el','en','es','et','fi','fr','hr','hu','it','lt','lv','mt','nl','pl','pt','ro','ru','sk','sl','sv','uk'
  ]), [])

  // Soniox supported languages (static list per docs). Keep in sync with codes in `languages` above.
  const sonioxAllowed = React.useMemo(() => new Set<string>([
    'en','es','fr','de','it','pt','nl','ru','zh','ja','ko','ar','hi','tr','pl','sv','no','da','fi','el','cs','ro','hu','sk','uk','he','id','vi','th','ms','tl','fa','ur','bn','ta','te','gu','pa','bg','hr','sr','sl','lv','lt','et','is','ca','gl'
  ]), [])

  const displayed = React.useMemo(() => {
    if (englishOnly) {
      return languages.filter(l => l.value === 'en')
    }
    if (engine === 'parakeet') {
      return languages.filter(l => parakeetAllowed.has(l.value))
    }
    if (engine === 'soniox') {
      return languages.filter(l => sonioxAllowed.has(l.value))
    }
    return languages
  }, [engine, parakeetAllowed, sonioxAllowed, englishOnly])

  // Multi-select mode is active only when the parent supplies BOTH the
  // enabled set AND the change handler AND the set has > 1 entries
  // (per research.md R-004). In all other cases the control collapses to
  // the legacy single-select layout — zero behaviour change for monolingual
  // users (SC-003).
  const multiSelectEnabled =
    Array.isArray(enabledLanguages) &&
    typeof onEnabledChange === 'function' &&
    enabledLanguages.length > 1

  // The "is the entry checked" predicate. In single-select mode (legacy)
  // there is no notion of "enabled" — only the active value is checked.
  const isEnabled = React.useCallback(
    (code: string) => {
      if (multiSelectEnabled) {
        return enabledLanguages!.includes(code)
      }
      return code === value
    },
    [multiSelectEnabled, enabledLanguages, value]
  )

  const handleToggleEnabled = React.useCallback(
    (code: string) => {
      if (!onEnabledChange || !Array.isArray(enabledLanguages)) return
      // Disallow removing the active language; the parent component should
      // surface "remove" via a different affordance (clicking the active
      // marker on a different row, then unchecking).
      if (enabledLanguages.includes(code)) {
        // Don't allow removing the last entry — parent normalises empty sets,
        // but disable the action client-side too for predictability.
        if (enabledLanguages.length <= 1) return
        const next = enabledLanguages.filter((c) => c !== code)
        onEnabledChange(next)
        // If we just removed the active language, fall back to the first
        // remaining entry. (FR-010 — remove-active fallback.)
        if (code === value && next.length > 0) {
          onValueChange(next[0])
        }
      } else {
        onEnabledChange([...enabledLanguages, code])
      }
    },
    [enabledLanguages, onEnabledChange, value, onValueChange]
  )

  const handleSetActive = React.useCallback(
    (code: string) => {
      // The active language must always be a member of the enabled set; if
      // it isn't yet (user clicked the radio on a not-yet-enabled row in
      // multi-select mode), enable it first.
      if (
        Array.isArray(enabledLanguages) &&
        !enabledLanguages.includes(code) &&
        onEnabledChange
      ) {
        onEnabledChange([...enabledLanguages, code])
      }
      onValueChange(code)
    },
    [enabledLanguages, onEnabledChange, onValueChange]
  )

  // Single-select-style trigger label: the active language's display name.
  // Always identical to the legacy single-select (SC-003).
  const triggerLabel = englishOnly
    ? "English"
    : value
      ? languages.find((language) => language.value === value)?.label
      : "Select language"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={englishOnly}
          className={cn("w-48 justify-between", className)}
        >
          {triggerLabel}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0">
        <Command>
          <CommandInput placeholder="Search language..." className="h-9" />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {displayed.map((language) => {
                const enabled = isEnabled(language.value)
                const active = value === language.value
                // In multi-select mode, non-EN entries are disabled when
                // the active model is English-only (englishOnly === true).
                // In legacy single-select mode the popover is already
                // disabled at the trigger level.
                const rowDisabled = englishOnly && language.value !== 'en'

                if (!multiSelectEnabled) {
                  // Legacy single-select layout — preserved verbatim so
                  // monolingual users see zero behaviour change (SC-003).
                  return (
                    <CommandItem
                      key={language.value}
                      value={language.label}
                      disabled={rowDisabled}
                      onSelect={() => {
                        handleSetActive(language.value)
                        setOpen(false)
                      }}
                    >
                      {language.label}
                      <Check
                        className={cn(
                          "ml-auto",
                          active ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  )
                }

                // Multi-select layout: a row carries (a) an active radio
                // marker on the left, (b) the language name, (c) a check on
                // the right that toggles enabled membership. Selecting the
                // row marks it active (and enables it if it wasn't yet).
                return (
                  <CommandItem
                    key={language.value}
                    value={language.label}
                    disabled={rowDisabled}
                    onSelect={() => {
                      handleSetActive(language.value)
                      setOpen(false)
                    }}
                  >
                    <button
                      type="button"
                      aria-label={
                        active ? `${language.label} (active)` : `Mark ${language.label} active`
                      }
                      data-testid={`language-active-${language.value}`}
                      className="mr-2 inline-flex items-center justify-center"
                      disabled={rowDisabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleSetActive(language.value)
                      }}
                    >
                      {active ? (
                        <Disc className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </button>
                    <span>{language.label}</span>
                    <button
                      type="button"
                      aria-label={
                        enabled
                          ? `Remove ${language.label} from enabled languages`
                          : `Enable ${language.label}`
                      }
                      data-testid={`language-enabled-${language.value}`}
                      className="ml-auto inline-flex items-center justify-center"
                      disabled={rowDisabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleToggleEnabled(language.value)
                      }}
                    >
                      <Check
                        className={cn(
                          enabled ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </button>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
