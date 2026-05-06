<div align="center">
  <img src="docs/voicetypr-extended-banner.png" alt="VoiceTypr Extended — disco cat at the mic" width="600">

  <img src="src-tauri/icons/icon.png" alt="VoiceTypr Logo" width="128" height="128">

  # VoiceTypr — Personal Fork

  **A personal fork of [moinulmoin/voicetypr](https://github.com/moinulmoin/voicetypr) — an open source AI voice-to-text dictation tool for macOS and Windows.**

  [![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE.md)
  [![macOS](https://img.shields.io/badge/macOS-13.0+-black)](https://www.apple.com/macos)
  [![Upstream](https://img.shields.io/badge/upstream-moinulmoin%2Fvoicetypr-181717?logo=github)](https://github.com/moinulmoin/voicetypr)
</div>

## 🍴 About this fork

This is **Tim Niemeier's personal fork** of VoiceTypr. All the heavy lifting — the recording engine, Whisper/Parakeet integration, the polished UI, the cross-platform plumbing — is the work of [**Moinul Moin**](https://github.com/moinulmoin) and the upstream contributors. Massive thanks to them for building and open-sourcing such a solid app under AGPL v3. If you want the official, supported, regularly-released version, **go to [moinulmoin/voicetypr](https://github.com/moinulmoin/voicetypr) and grab it there** — and consider supporting the project.

This fork exists for one reason: to scratch a few personal itches without bothering upstream. It is **not packaged for distribution, not signed, not notarized, and not a competing product**. If you stumbled in here, you almost certainly want the upstream repo instead.

### What's different in this fork

- ✏️ **Editable AI formatting prompts** — the four built-in prompt templates (base, prompts, email, commit) are exposed as editable textareas in the Formatting tab, with per-prompt reset to defaults.
- 🧹 **Sidebar & About cleanup** — license/upgrade UI removed, About section reworked to show fork status, upstream credits, and a fork-local changelog.
- 🔓 **License gate bypassed locally** — since this is a personal build, the trial/license check is short-circuited. The upstream app uses a paid license model; please respect that and pay for the official version if you use it.
- 📌 **Pinned to a specific upstream version** — currently tracking VoiceTypr **v1.12.3**. Periodically rebased on upstream `main`.

Everything else — features, architecture, install steps — is unchanged from upstream. The sections below are the upstream README, lightly trimmed.

---

## 🎯 What is VoiceTypr?

VoiceTypr is an open source AI voice-to-text dictation tool, alternative to Wispr Flow and SuperWhisper. Available for macOS and Windows. Pay once, use forever.

## ✨ Features

### 🎙️ **Instant Voice-to-Text**
- System-wide hotkey for quick recording
- Automatic text insertion at cursor position
- Works in any app - cursor, claude code, chatgpt, slack, etc

### 🤖 **Powered by local AI**
- 100% offline transcription - your voice never leaves your device
- Multiple model sizes for accuracy vs speed tradeoffs
- Support for 99+ languages out of the box
- Hardware acceleration (Metal on macOS)

### 🚀 **Native Performance**
- Built with Rust and Tauri for blazing-fast performance
- Optimized for each platform with hardware acceleration
- Minimal resource usage with maximum efficiency

### 🔒 **Privacy First**
- Complete offline operation - no cloud, no tracking (only trial check)
- Your recordings stay on your device
- Open source for full transparency

### 🤖 **AI Enhancement** (NEW)
- Transform your transcriptions with AI (Groq/Gemini)
- Smart presets: Prompts, Email, Commits, Notes
- Secure API key storage
- Requires internet connection for enhancement only

### 🎨 **Clean Design**
- Clean, user interface
- Menubar integration for quick access
- Visual feedback during recording
- Auto-updates to keep you on the latest version

## 📦 Installation

### Requirements

#### macOS
- macOS 13.0 (Ventura) or later
- 3-4 GB free disk space (for AI models)
- Microphone access permission
- Accessibility access permission

#### Windows
- Windows 10/11 (64-bit)
- 3-4 GB free disk space (for AI models)
- GPU acceleration available (5-10x faster with NVIDIA, AMD, Intel GPUs)

### Quick Install

> **Note:** This fork does **not** publish release binaries. The links below point to the upstream project's official builds — use those.

#### macOS
1. Download the latest [VoiceTypr.dmg](https://github.com/moinulmoin/voicetypr/releases/latest)
2. Open the DMG and drag VoiceTypr to Applications
3. Launch VoiceTypr from Applications
4. Follow the onboarding to download your preferred AI model

> **Note**: VoiceTypr is fully signed and notarized by Apple, so you can run it without security warnings.

#### Windows
1. Download the latest [VoiceTypr installer](https://github.com/moinulmoin/voicetypr/releases/latest)
2. Run the installer
3. Launch VoiceTypr from Start Menu
4. Follow the onboarding to download your preferred AI model

> **GPU Acceleration (5-10x faster)**
> - VoiceTypr automatically uses your GPU if available
> - For best performance, ensure your graphics drivers are up to date:
>   - [NVIDIA Drivers](https://www.nvidia.com/drivers)
>   - [AMD Drivers](https://www.amd.com/support)
>   - [Intel Drivers](https://www.intel.com/content/www/us/en/support/products/80939/graphics.html)
> - Falls back to CPU automatically if GPU unavailable

## 🎮 Usage

### Getting Started

1. **Launch VoiceTypr** - Find it in your Applications folder (macOS) or Start Menu (Windows)
2. **Grant Permissions** - Allow microphone access (and accessibility on macOS)
3. **Download a Model** - Choose from tiny to large models based on your needs
4. **Start Transcribing** - Press your hotkey anywhere to record

### Tips & Tricks

- 🎯 **Quick Cancel**: Double Press `Esc` while recording to cancel
- 📝 **Long Recordings**: VoiceTypr handles extended recordings seamlessly but shorter recordings are recommended to do.
- 🌍 **Multiple Languages**: Just speak - Whisper auto-detects the language
- ⚡ **Instant Insert**: Text appears right where your cursor is

### Project Structure

```
voicetypr/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/             # Custom React hooks
│   └── types/             # TypeScript types
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── audio/         # Audio recording
│   │   ├── whisper/       # Whisper integration
│   │   └── commands/      # Tauri commands
│   └── capabilities/      # Security capabilities
├── scripts/               # Build and utility scripts
└── tests/                 # Test suites
```

## 🔧 Troubleshooting

### Windows GPU Acceleration

VoiceTypr automatically detects and uses your GPU for faster transcription. If you're experiencing slower performance:

**Update your graphics drivers** - This is the most common fix:
   - [NVIDIA Drivers](https://www.nvidia.com/drivers)
   - [AMD Drivers](https://www.amd.com/support)
   - [Intel Drivers](https://www.intel.com/content/www/us/en/support/products/80939/graphics.html)

> **Note**: VoiceTypr always works - it automatically falls back to CPU if GPU acceleration is unavailable

## 🙏 Credits

VoiceTypr is created and maintained by [**Moinul Moin**](https://github.com/moinulmoin) at [moinulmoin/voicetypr](https://github.com/moinulmoin/voicetypr). This fork is a personal modification — all credit for the design, engineering, and ongoing maintenance belongs to Moin and the upstream contributors. If you find the app useful, please support the original project.

## 📄 License

VoiceTypr is licensed under the [GNU Affero General Public License v3.0](LICENSE.md). This fork inherits the same license; modifications in this fork are also released under AGPL v3.
</div>
