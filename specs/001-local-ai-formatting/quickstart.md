# Quickstart — Local LLM Text Formatting (Ollama)

A short walkthrough so a developer can verify the feature end-to-end after
implementing it.

---

## Prerequisites

1. **Ollama installed and running** on the dev machine. On macOS:

   ```bash
   brew install ollama
   ollama serve     # daemon
   ```

   Verify the OpenAI-compatible endpoint responds:

   ```bash
   curl http://localhost:11434/v1/models
   # expect: {"data":[{"id":"<model>", ...}, ...], ...}
   ```

2. **At least one general-purpose chat model pulled.** Recommended for
   formatting (good price/quality on a Mac, per SC-007's ≥7 B requirement):

   ```bash
   ollama pull llama3.2:3b   # smaller, faster
   # or
   ollama pull qwen2.5:7b    # higher quality, slower
   ```

3. **VoiceTypr dev environment** running:

   ```bash
   pnpm install
   pnpm tauri dev
   ```

---

## Happy-path verification (SC-001: under 2 minutes)

Wall-clock budget: <2 minutes. Stopwatch optional.

1. Open Settings → Formatting.
2. Confirm an **Ollama** card is present alongside OpenAI / Anthropic /
   Google Gemini / Custom (OpenAI-compatible). It should appear last.
3. Click **Configure** on the Ollama card.
4. The configuration sheet opens with:
   - **API Base URL**: `http://localhost:11434/v1` (pre-filled).
   - **Model ID**: empty.
   - **API Key**: empty (no auth required).
5. Type a model id you have pulled (e.g. `llama3.2:3b`).
6. Click **Test**.
   - Expect: green "Connection successful" within 5 s (FR-009 / SC-003).
7. Click **Save**.
   - Toast: "Ollama provider configured".
8. The Ollama card now shows **Active** when AI Formatting is toggled on.
9. Toggle **AI Formatting** on (top right of the Formatting panel) if it
   isn't already.
10. Trigger the global dictation hotkey, say a sentence with deliberate
    grammar issues:
    > "so um basically the new feature like its working when ollama is up"
11. Verify:
    - Cursor receives a cleaned-up, properly-punctuated version.
    - macOS network monitor shows no outbound connection beyond loopback
      (SC-002). Use `lsof -i -nP | grep voicetypr` or `nettop -P -p
      $(pgrep voicetypr)` to confirm.

✅ If steps 1-11 pass: SC-001, SC-002, SC-003, SC-005, SC-007 all green.

---

## Failure-mode verification (SC-003 + FR-007)

### Server unreachable

1. Stop the Ollama daemon (`brew services stop ollama` or kill the
   `ollama serve` process).
2. With Ollama still selected and active, trigger a dictation.
3. Verify:
   - User-visible error toast names `http://localhost:11434/v1` and says
     the server is unreachable, **within 5 s** (SC-003).
   - Raw transcription is still inserted at the cursor (FR-007 b).
   - No outbound HTTP request to OpenAI / Anthropic / Gemini (FR-007 c).

### Model not found

1. Restart Ollama.
2. In Settings → Formatting → Ollama card, click the gear icon (Configure).
3. Change **Model ID** to a model you have NOT pulled (e.g.
   `definitely-not-a-real-model:99b`).
4. Click **Test**.
5. Verify:
   - Test result: red error mentioning "Model … not found in endpoint
     model list" within 5 s.
6. Save anyway, then trigger dictation.
7. Verify a "model not found" error toast and raw transcription inserted.

### Auth failure (rare; only if the user runs Ollama behind an auth proxy)

This path is exercised the same way as the cloud providers — a wrong API
key produces a 401 error. Not part of the default Ollama flow but the code
is the same path as `Custom`.

---

## Privacy-guarantee verification (SC-002, FR-004, FR-010)

1. Open `nettop -P -p $(pgrep voicetypr)` in a terminal.
2. With Ollama active, trigger 5 dictations of varied length.
3. Verify in `nettop` that the only remote endpoint is the loopback
   address (`127.0.0.1:11434` or `::1:11434`).
4. **Negative control**: switch active provider to OpenAI (or any cloud
   provider you have configured), trigger a dictation, watch `nettop`
   show the cloud endpoint. Switch back to Ollama, dictate again, watch
   the network return to loopback only. ✅ FR-004.

---

## Coexistence with Custom provider (FR-012)

1. If you previously configured the **Custom (OpenAI-compatible)** card to
   point at Ollama (the pre-feature workaround), confirm:
   - The Custom card still appears in the list with the same
     configuration (URL, model).
   - You can still set Custom active and use it.
   - Adding the new Ollama card did NOT clear or modify the Custom
     configuration.
2. Switch active between Custom (Ollama-via-Custom) and the new Ollama
   card; both should work.

---

## Custom-prompt coexistence (FR-005, FR-008)

1. Open the **Custom Prompts (Advanced)** section, edit the **Email**
   preset prompt.
2. Switch active provider Cloud → Ollama → Cloud → Ollama.
3. Verify the edited Email prompt persists across all switches and
   applies regardless of which provider is active.

---

## Done

If all sections above pass, the implementation satisfies the spec's
P1 (US1) and the gating requirements from P2 (US2) and P3 (US3). At
that point, run the automated suites:

```bash
pnpm lint && pnpm typecheck && pnpm test
cd src-tauri && cargo test
```

All four MUST pass green per Constitution IV before the feature is
declared shippable.
