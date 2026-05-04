import { ApiKeyModal } from "@/components/ApiKeyModal";
import { EnhancementSettings } from "@/components/EnhancementSettings";
import { OpenAICompatConfigModal } from "@/components/OpenAICompatConfigModal";
import { ProviderCard } from "@/components/ProviderCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CustomPrompts, EnhancementOptions } from "@/types/ai";
import { fromBackendOptions, toBackendOptions } from "@/types/ai";
import { AI_PROVIDERS } from "@/types/providers";
import { useAllProviderModels } from "@/hooks/useProviderModels";
import { hasApiKey, removeApiKey, saveApiKey, getApiKey } from "@/utils/keyring";
import { getErrorMessage } from "@/utils/error";
import { useReadinessState } from "@/contexts/ReadinessContext";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronDown, FileText, GitCommit, Info, Mail, Sparkles } from "lucide-react";

interface AISettings {
  enabled: boolean;
  provider: string;
  model: string;
  hasApiKey: boolean;
}

const EMPTY_CUSTOM_PROMPTS: CustomPrompts = {
  base: null,
  prompts: null,
  email: null,
  commit: null,
};

// Must match `MAX_CUSTOM_PROMPT_LEN` in src-tauri/src/ai/prompts.rs.
const MAX_CUSTOM_PROMPT_LEN = 8192;

export function EnhancementsSection() {
  const readiness = useReadinessState();
  const { fetchModels, getModels, isLoading: isModelsLoading, getError, clearModels } = useAllProviderModels();
  
  const [aiSettings, setAISettings] = useState<AISettings>({
    enabled: false,
    provider: "",
    model: "",
    hasApiKey: false,
  });

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showOpenAIConfig, setShowOpenAIConfig] = useState(false);
  const [openAIDefaultBaseUrl, setOpenAIDefaultBaseUrl] = useState("https://api.openai.com/v1");
  const [customModelName, setCustomModelName] = useState<string>("");
  const [ollamaModelName, setOllamaModelName] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";
  const [isLoading, setIsLoading] = useState(false);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, boolean>>({});
  const [enhancementOptions, setEnhancementOptions] = useState<{
    preset: "Default" | "Prompts" | "Email" | "Commit";
    customVocabulary: string[];
  }>({
    preset: 'Default',
    customVocabulary: [],
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Custom prompts (advanced) state.
  const [customPrompts, setCustomPrompts] = useState<CustomPrompts>(EMPTY_CUSTOM_PROMPTS);
  const [defaultPrompts, setDefaultPrompts] = useState<CustomPrompts>(EMPTY_CUSTOM_PROMPTS);
  const [customPromptsLoaded, setCustomPromptsLoaded] = useState(false);
  const [customPromptsOpen, setCustomPromptsOpen] = useState(false);
  // Which prompt field is currently displayed for editing. Independent from the
  // runtime preset selector in Formatting Options.
  const [editingPrompt, setEditingPrompt] = useState<keyof CustomPrompts>('base');
  // Local textarea drafts so typing stays smooth and we only persist on blur.
  const [promptDrafts, setPromptDrafts] = useState<Record<keyof CustomPrompts, string>>({
    base: '',
    prompts: '',
    email: '',
    commit: '',
  });
  // Track which fields the user has edited locally vs. ones that just mirror the
  // resolved (override-or-default) value. Only edited fields are written back.
  const editedFieldsRef = useRef<Record<keyof CustomPrompts, boolean>>({
    base: false,
    prompts: false,
    email: false,
    commit: false,
  });

  const loadCustomPrompts = useCallback(async () => {
    try {
      const [overridesRaw, defaultsRaw] = await Promise.all([
        invoke<CustomPrompts>("get_custom_prompts"),
        invoke<CustomPrompts>("get_default_prompts"),
      ]);
      // Defensive: fall back to the empty shape if the backend (or test mock)
      // returns undefined/null so subsequent reads never throw.
      const overrides: CustomPrompts = overridesRaw ?? EMPTY_CUSTOM_PROMPTS;
      const defaults: CustomPrompts = defaultsRaw ?? EMPTY_CUSTOM_PROMPTS;
      setCustomPrompts(overrides);
      setDefaultPrompts(defaults);
      setPromptDrafts({
        base: overrides.base ?? defaults.base ?? '',
        prompts: overrides.prompts ?? defaults.prompts ?? '',
        email: overrides.email ?? defaults.email ?? '',
        commit: overrides.commit ?? defaults.commit ?? '',
      });
      editedFieldsRef.current = { base: false, prompts: false, email: false, commit: false };
      setCustomPromptsLoaded(true);
    } catch (error) {
      console.error("Failed to load custom prompts:", error);
    }
  }, []);

  const persistCustomPrompts = useCallback(async (next: CustomPrompts) => {
    try {
      await invoke("update_custom_prompts", { prompts: next });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save custom prompts");
      toast.error(message);
    }
  }, []);

  const handlePromptBlur = (field: keyof CustomPrompts) => {
    if (!editedFieldsRef.current[field]) return;
    editedFieldsRef.current[field] = false;

    const draft = promptDrafts[field];
    const defaultValue = defaultPrompts[field] ?? '';
    // Treat empty string and "matches the default" as no-override (null).
    const trimmed = draft;
    const newValue: string | null =
      trimmed === '' || trimmed === defaultValue ? null : trimmed;

    if (customPrompts[field] === newValue) return;

    const next: CustomPrompts = { ...customPrompts, [field]: newValue };
    setCustomPrompts(next);
    void persistCustomPrompts(next);
  };

  const handleResetPrompt = (field: keyof CustomPrompts) => {
    const defaultValue = defaultPrompts[field] ?? '';
    setPromptDrafts((prev) => ({ ...prev, [field]: defaultValue }));
    editedFieldsRef.current[field] = false;
    if (customPrompts[field] === null) return;
    const next: CustomPrompts = { ...customPrompts, [field]: null };
    setCustomPrompts(next);
    void persistCustomPrompts(next);
  };

  // Switching tabs flushes any pending blur so unsaved edits to the outgoing
  // tab's textarea aren't lost when it unmounts.
  const handleEditingPromptChange = (next: keyof CustomPrompts) => {
    if (next === editingPrompt) return;
    if (editedFieldsRef.current[editingPrompt]) {
      handlePromptBlur(editingPrompt);
    }
    setEditingPrompt(next);
  };

  const customPromptFields: Array<{
    key: keyof CustomPrompts;
    label: string;
    icon: typeof FileText;
    description: string;
    rows: number;
    hint?: string;
  }> = [
    {
      key: 'base',
      label: 'Base',
      icon: FileText,
      description: 'Always-applied post-processor; cleans grammar, fillers, capitalization.',
      rows: 12,
      hint: 'Use {language} where you want the output language inserted.',
    },
    {
      key: 'prompts',
      label: 'Prompts',
      icon: Sparkles,
      description: 'Layered on top of Base when the Prompts preset is active.',
      rows: 8,
    },
    {
      key: 'email',
      label: 'Email',
      icon: Mail,
      description: 'Layered on top of Base when the Email preset is active.',
      rows: 8,
    },
    {
      key: 'commit',
      label: 'Commit',
      icon: GitCommit,
      description: 'Layered on top of Base when the Commit preset is active.',
      rows: 6,
    },
  ];

  const activePromptField =
    customPromptFields.find((f) => f.key === editingPrompt) ?? customPromptFields[0];
  const isActiveOverridden = customPrompts[activePromptField.key] !== null;

  const loadEnhancementOptions = async () => {
    try {
      const options = await invoke<EnhancementOptions>("get_enhancement_options");
      setEnhancementOptions(fromBackendOptions(options));
    } catch (error) {
      console.error("Failed to load enhancement options:", error);
    }
  };

  const loadAISettings = useCallback(async () => {
    try {
      // Check and cache API keys for all providers
      const allProviders = AI_PROVIDERS.map(p => p.id);
      const keyStatus: Record<string, boolean> = {};

      await Promise.all(allProviders.map(async (providerId) => {
        const keyId = providerId;
        let isConfigured = await hasApiKey(keyId);

        // For providers that may be configured without a keyring key (no-auth),
        // fall back to backend-derived readiness (covers legacy OpenAI-compatible configs
        // and the loopback Ollama default).
        if ((providerId === 'custom' || providerId === 'openai' || providerId === 'ollama') && !isConfigured) {
          try {
            const providerSettings = await invoke<AISettings>('get_ai_settings_for_provider', {
              provider: providerId
            });
            isConfigured = providerSettings.hasApiKey;
          } catch (error) {
            console.error(`Failed to resolve ${providerId} provider readiness:`, error);
          }
        }

        keyStatus[providerId] = isConfigured;

        if (isConfigured) {
          try {
            const apiKey = await getApiKey(keyId);
            if (apiKey) {
              console.log(`[AI Settings] Found ${keyId} API key in keyring, caching to backend`);
              await invoke('cache_ai_api_key', { args: { provider: providerId, apiKey } });
            }
          } catch (error) {
            console.error(`Failed to cache ${keyId} API key:`, error);
          }
        }
      }));

      setProviderApiKeys(keyStatus);

      // Load custom provider config
      try {
        const customConfig = await invoke<{ baseUrl: string }>('get_openai_config');
        setOpenAIDefaultBaseUrl(customConfig.baseUrl || "https://api.openai.com/v1");
      } catch (error) {
        console.error('Failed to load custom config:', error);
      }

      // Load AI settings from backend
      const settings = await invoke<AISettings>("get_ai_settings");
      
      // If using custom provider, track model name
      if (settings.provider === 'custom') {
        setCustomModelName(settings.model);
      }
      if (settings.provider === 'ollama') {
        setOllamaModelName(settings.model);
      }

      setAISettings(settings);

      // If readiness state shows AI is ready, update the provider key status
      if (readiness?.ai_ready && settings.provider) {
        setProviderApiKeys(prev => ({ ...prev, [settings.provider]: true }));
      }

      // Pre-fetch models for all providers with API keys (list is static, so this is fast).
      // Skip providers without a curated model list — they ask the user to type the model id.
      const providersWithKeys = allProviders.filter(p => {
        const cfg = AI_PROVIDERS.find(prov => prov.id === p);
        return keyStatus[p] && !cfg?.isCustom;
      });
      providersWithKeys.forEach(providerId => {
        fetchModels(providerId);
      });
    } catch (error) {
      console.error("Failed to load AI settings:", error);
    }
  }, [readiness, fetchModels]);

  // Load settings when component mounts
  useEffect(() => {
    if (!settingsLoaded) {
      loadAISettings();
      loadEnhancementOptions();
      loadCustomPrompts();
      setSettingsLoaded(true);
    }
  }, [settingsLoaded, loadAISettings, loadCustomPrompts]);

  // Listen for AI events
  useEffect(() => {
    const unlistenReady = listen('ai-ready', async () => {
      if (settingsLoaded) {
        await loadAISettings();
      }
    });

    const unlistenApiKey = listen('api-key-saved', async (event) => {
      console.log('[AI Settings] API key saved:', event.payload);
      const settings = await invoke<AISettings>("get_ai_settings");
      setAISettings(settings);
      
      const provider = (event.payload as { provider?: string }).provider;
      if (provider) {
        setProviderApiKeys(prev => ({ ...prev, [provider]: true }));
      }
    });

    const unlistenApiKeyRemoved = listen<{ provider: string }>('api-key-removed', async (event) => {
      console.log('[AI Settings] API key removed:', event.payload.provider);
      let providerStillConfigured = false;

      if (event.payload.provider === 'custom' || event.payload.provider === 'openai' || event.payload.provider === 'ollama') {
        try {
          const providerSettings = await invoke<AISettings>('get_ai_settings_for_provider', {
            provider: event.payload.provider
          });
          providerStillConfigured = providerSettings.hasApiKey;
          setProviderApiKeys(prev => ({ ...prev, [event.payload.provider]: providerStillConfigured }));
        } catch (error) {
          console.error(
            `Failed to refresh ${event.payload.provider} provider readiness after key removal:`,
            error
          );
          setProviderApiKeys(prev => ({ ...prev, [event.payload.provider]: false }));
        }
      } else {
        setProviderApiKeys(prev => ({ ...prev, [event.payload.provider]: false }));
      }
      
      // Clear cached models for removed provider
      clearModels(event.payload.provider);
      
      // If removed provider is currently selected, clear selection
      const isCurrentProviderRemoved = aiSettings.provider === event.payload.provider && !providerStillConfigured;
      
      if (isCurrentProviderRemoved) {
        setAISettings(prev => ({
          ...prev,
          enabled: false,
          provider: "",
          model: "",
          hasApiKey: false
        }));
        
        await invoke("update_ai_settings", {
          enabled: false,
          provider: "",
          model: ""
        });
      }
    });

    const unlistenFormattingError = listen<string>('formatting-error', async (event) => {
      const msg = event.payload || 'Formatting failed';
      toast.error(typeof msg === 'string' ? msg : 'Formatting failed');
    });

    return () => {
      Promise.all([unlistenReady, unlistenApiKey, unlistenApiKeyRemoved, unlistenFormattingError]).then(fns => {
        fns.forEach(fn => fn());
      });
    };
  }, [settingsLoaded, aiSettings.provider, clearModels]);

  const handleEnhancementOptionsChange = async (newOptions: typeof enhancementOptions) => {
    setEnhancementOptions(newOptions);
    try {
      await invoke("update_enhancement_options", {
        options: toBackendOptions(newOptions)
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save enhancement options");
      toast.error(message);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    const hasActiveProviderKey = Boolean(providerApiKeys[aiSettings.provider]);

    if (enabled && (!hasActiveProviderKey || !aiSettings.model)) {
      toast.error("Please select a provider, add an API key, and select a model first");
      return;
    }

    try {
      await invoke("update_ai_settings", {
        enabled,
        provider: aiSettings.provider,
        model: aiSettings.model
      });

      setAISettings(prev => ({ ...prev, enabled }));
      toast.success(enabled ? "AI formatting enabled" : "AI formatting disabled");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to update AI settings");
      toast.error(message);
    }
  };

  const handleSetupApiKey = async (providerId: string) => {
    setSelectedProvider(providerId);

    if (providerId === "custom") {
      // Custom provider - show OpenAI config modal
      try {
        const savedConfig = await invoke<{ baseUrl: string }>('get_openai_config');
        setOpenAIDefaultBaseUrl(savedConfig.baseUrl || "https://api.openai.com/v1");
      } catch (error) {
        console.error('Failed to load custom config:', error);
      }
      setShowOpenAIConfig(true);
    } else if (providerId === "ollama") {
      // Ollama - reuse the OpenAI-compatible modal with a loopback default URL.
      setOpenAIDefaultBaseUrl(OLLAMA_DEFAULT_BASE_URL);
      setShowOpenAIConfig(true);
    } else {
      // Standard provider - show API key modal
      setShowApiKeyModal(true);
    }
  };

  const handleApiKeySubmit = async (apiKey: string) => {
    setIsLoading(true);
    try {
      const trimmedKey = apiKey.trim();
      await saveApiKey(selectedProvider, trimmedKey);

      // Update provider key status
      setProviderApiKeys(prev => ({ ...prev, [selectedProvider]: true }));

      // Don't auto-select model - user will do it from dropdown
      // Just update the provider
      setAISettings(prev => ({
        ...prev,
        provider: selectedProvider,
        hasApiKey: true
      }));

      setShowApiKeyModal(false);
      toast.success("API key saved securely");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save API key");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveApiKey = async (providerId: string) => {
    try {
      await removeApiKey(providerId);
      // Clear cached models
      clearModels(providerId);
      toast.success("API key removed");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to remove API key");
      toast.error(message);
    }
  };

  const handleSelectModel = async (providerId: string, modelId: string) => {
    try {
      const hasKey = providerApiKeys[providerId];
      const shouldEnable = hasKey ? aiSettings.enabled : false;

      await invoke("update_ai_settings", {
        enabled: shouldEnable,
        provider: providerId,
        model: modelId
      });

      setAISettings(prev => ({
        ...prev,
        enabled: shouldEnable,
        provider: providerId,
        model: modelId,
        hasApiKey: hasKey
      }));

      toast.success("Model selected");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to select model");
      toast.error(message);
    }
  };

  // Check if any provider has a valid API key
  const hasAnyValidConfig = Object.values(providerApiKeys).some(v => v);

  // Check if we have a selected model
  const activeProviderConfig = AI_PROVIDERS.find(p => p.id === aiSettings.provider);
  const isUsingCustomKindProvider = Boolean(activeProviderConfig?.isCustom);
  const hasSelectedModel = Boolean(
    aiSettings.provider &&
    aiSettings.model &&
    (isUsingCustomKindProvider || providerApiKeys[aiSettings.provider])
  );

  // Get active model name for display
  const activeModelName = isUsingCustomKindProvider
    ? (aiSettings.provider === 'ollama' ? ollamaModelName : customModelName)
    : getModels(aiSettings.provider).find(m => m.id === aiSettings.model)?.name || aiSettings.model;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Formatting</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered text formatting and enhancement
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
            <Label htmlFor="ai-formatting" className="text-sm font-medium cursor-pointer">
              AI Formatting
            </Label>
            <Switch
              id="ai-formatting"
              checked={aiSettings.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={!hasAnyValidConfig || !hasSelectedModel}
            />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
          {/* AI Providers Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">AI Providers</h2>
              <div className="h-px bg-border/50 flex-1" />
              {activeModelName && aiSettings.enabled && (
                <span className="text-sm text-muted-foreground">
                  Active: <span className="text-amber-600 dark:text-amber-500">{activeModelName}</span>
                </span>
              )}
            </div>
            
            <div className="grid gap-3">
              {AI_PROVIDERS.map((provider) => {
                // For isCustom providers, "active" means: provider is selected, has a key
                // (or no-auth config), and AI Formatting is enabled.
                const isCustomKindActive = Boolean(
                  provider.isCustom &&
                  aiSettings.provider === provider.id &&
                  providerApiKeys[provider.id] &&
                  aiSettings.enabled
                );
                const isActive = provider.isCustom
                  ? isCustomKindActive
                  : Boolean(aiSettings.provider === provider.id && aiSettings.enabled);

                const cardModelName = provider.id === 'ollama'
                  ? ollamaModelName
                  : provider.id === 'custom'
                    ? customModelName
                    : undefined;

                return (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    hasApiKey={providerApiKeys[provider.id] || false}
                    isActive={isActive}
                    selectedModel={provider.isCustom
                      ? (isCustomKindActive ? (cardModelName ?? null) : null)
                      : (aiSettings.provider === provider.id ? aiSettings.model : null)
                    }
                    onSetupApiKey={() => handleSetupApiKey(provider.id)}
                    onRemoveApiKey={() => handleRemoveApiKey(provider.id)}
                    onSelectModel={(modelId) => handleSelectModel(provider.id, modelId)}
                    models={getModels(provider.id)}
                    modelsLoading={isModelsLoading(provider.id)}
                    modelsError={getError(provider.id)}
                    onRefreshModels={() => fetchModels(provider.id)}
                    customModelName={provider.isCustom ? cardModelName : undefined}
                  />
                );
              })}
            </div>
          </div>

          {/* Formatting Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Formatting Options</h2>
              <div className="h-px bg-border/50 flex-1" />
            </div>

            <div className={!aiSettings.enabled ? "opacity-50 pointer-events-none" : ""}>
              <EnhancementSettings
                settings={enhancementOptions}
                onSettingsChange={handleEnhancementOptionsChange}
              />
            </div>
          </div>

          {/* Custom Prompts (Advanced) */}
          <Collapsible
            open={customPromptsOpen}
            onOpenChange={setCustomPromptsOpen}
            className="space-y-4"
          >
            <CollapsibleTrigger
              data-testid="custom-prompts-toggle"
              className="w-full flex items-center gap-2 text-left"
            >
              <h2 className="text-base font-semibold">Custom Prompts (Advanced)</h2>
              <div className="h-px bg-border/50 flex-1" />
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  customPromptsOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Override the prompts sent to the AI model. Leave a field unchanged
                to use the built-in default. Reset clears the override and restores
                the shipped prompt.
              </p>
              {!customPromptsLoaded ? (
                <div
                  data-testid="custom-prompts-loading"
                  className="text-xs text-muted-foreground py-4"
                >
                  Loading prompts...
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Tab pill selector — matches the Formatting Options visual style. */}
                  <div className="flex flex-wrap gap-2">
                    {customPromptFields.map((field) => {
                      const Icon = field.icon;
                      const isSelected = editingPrompt === field.key;
                      const isOverridden = customPrompts[field.key] !== null;
                      return (
                        <Button
                          key={field.key}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className="gap-2"
                          onClick={() => handleEditingPromptChange(field.key)}
                          data-testid={`custom-prompt-tab-${field.key}`}
                        >
                          <Icon className="h-4 w-4" />
                          {field.label}
                          {isOverridden && (
                            <span className="ml-1 text-xs text-amber-600 dark:text-amber-500 font-normal">
                              (custom)
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Active tab description */}
                  <p className="text-sm text-muted-foreground">
                    {activePromptField.description}
                  </p>

                  {/* Single textarea for the active tab */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor={`custom-prompt-${activePromptField.key}`}
                        className="text-sm font-medium"
                      >
                        {activePromptField.label} Prompt
                        {isActiveOverridden && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-500 font-normal">
                            (custom)
                          </span>
                        )}
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleResetPrompt(activePromptField.key)}
                        disabled={!isActiveOverridden}
                        data-testid={`reset-prompt-${activePromptField.key}`}
                      >
                        Reset to default
                      </Button>
                    </div>
                    <Textarea
                      id={`custom-prompt-${activePromptField.key}`}
                      data-testid={`custom-prompt-${activePromptField.key}`}
                      rows={activePromptField.rows}
                      maxLength={MAX_CUSTOM_PROMPT_LEN}
                      value={promptDrafts[activePromptField.key]}
                      onChange={(e) => {
                        editedFieldsRef.current[activePromptField.key] = true;
                        const value = e.target.value;
                        setPromptDrafts((prev) => ({
                          ...prev,
                          [activePromptField.key]: value,
                        }));
                      }}
                      onBlur={() => handlePromptBlur(activePromptField.key)}
                      className="font-mono text-xs"
                    />
                    {editingPrompt === 'base' && activePromptField.hint && (
                      <p className="text-xs text-muted-foreground">{activePromptField.hint}</p>
                    )}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Setup Guide */}
          {!aiSettings.enabled && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <Info className="h-4 w-4 text-amber-500" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-medium text-sm">Quick Setup</h3>
                  <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Choose a provider above (OpenAI, Anthropic, Google, or Ollama)</li>
                    <li>Click "Add Key" and enter your API key</li>
                    <li>Select a model from the dropdown</li>
                    <li>Toggle "AI Formatting" on to enable</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-3">
                    AI formatting automatically improves your transcribed text with proper punctuation, grammar, and style in your selected language.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSubmit={handleApiKeySubmit}
        providerName={selectedProvider}
        isLoading={isLoading}
      />
      
      <OpenAICompatConfigModal
        isOpen={showOpenAIConfig}
        defaultBaseUrl={openAIDefaultBaseUrl}
        defaultModel={(selectedProvider === 'ollama' ? ollamaModelName : customModelName) || ''}
        onClose={() => setShowOpenAIConfig(false)}
        onSubmit={async ({ baseUrl, model, apiKey }) => {
          try {
            setIsLoading(true);
            const trimmedBase = baseUrl.trim();
            const trimmedModel = model.trim();
            const trimmedKey = apiKey?.trim() || '';
            const targetProvider = selectedProvider === 'ollama' ? 'ollama' : 'custom';

            if (targetProvider === 'ollama') {
              // Persist URL/no_auth/model and probe the endpoint in one shot.
              await invoke('validate_and_cache_api_key', {
                args: {
                  provider: 'ollama',
                  apiKey: trimmedKey || undefined,
                  baseUrl: trimmedBase,
                  model: trimmedModel,
                },
              });
              if (trimmedKey) {
                // Only persist a bearer token to the keyring when the user actually
                // supplied one (rare proxied-Ollama case). Default Ollama is no-auth.
                await saveApiKey('ollama', trimmedKey);
              }
            } else {
              // Save custom OpenAI-compatible config (base URL)
              await invoke('set_openai_config', { args: { baseUrl: trimmedBase } });
              // Save API key under 'custom' provider
              if (trimmedKey) {
                await saveApiKey('custom', trimmedKey);
              }
            }

            // Update settings
            const nextEnabled = aiSettings.enabled || !aiSettings.model;
            await invoke('update_ai_settings', { enabled: nextEnabled, provider: targetProvider, model: trimmedModel });

            // Update local state
            if (targetProvider === 'ollama') {
              setOllamaModelName(trimmedModel);
            } else {
              setCustomModelName(trimmedModel);
              setOpenAIDefaultBaseUrl(trimmedBase);
            }

            setAISettings(prev => ({
              ...prev,
              enabled: nextEnabled,
              provider: targetProvider,
              model: trimmedModel,
              hasApiKey: true
            }));

            setProviderApiKeys(prev => ({ ...prev, [targetProvider]: true }));

            toast.success(targetProvider === 'ollama' ? 'Ollama provider configured' : 'Custom provider configured');
            setShowOpenAIConfig(false);
          } catch (error) {
            const message = getErrorMessage(error, 'Failed to save configuration');
            toast.error(message);
          } finally {
            setIsLoading(false);
          }
        }}
      />
    </div>
  );
}
