<!--
SYNC IMPACT REPORT
Version change: (template, unfilled) → 1.0.0
Bump rationale: Initial ratification of a concrete constitution; all five
principles and both supporting sections populated for the first time. Prior
file was the unmodified template, so this is the first real version (1.0.0)
rather than a MAJOR bump from a prior numbered baseline.

Modified principles: n/a (initial population)
  - I. Upstream Fidelity (NEW)
  - II. Privacy & Offline-First (NEW)
  - III. Native Performance & Lean Dependencies (NEW)
  - IV. Type Safety & Quality Gates (NEW)
  - V. Personal-Use Disclosure (NEW)

Added sections:
  - Technology & Compliance Constraints
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check gate
    rewritten to reference the five principles by name.
  - ✅ .specify/templates/spec-template.md — no change needed (does not
    reference constitution directly).
  - ✅ .specify/templates/tasks-template.md — no change needed (no
    principle-driven task categories required for this fork).
  - ✅ CLAUDE.md (project) — already aligned with these principles
    (offline-first, type safety, AGPL/fork posture); no change forced.
  - ✅ README.md — already aligned (fork status, upstream credit, no
    distribution); no change forced.

Follow-up TODOs: none. RATIFICATION_DATE set to today (2026-05-04) since
this is the first concrete adoption of the constitution for this fork.
-->

# VoiceTypr Personal-Fork Constitution

This constitution governs the personal fork at `voicetypr-extended-free`,
maintained by Tim Niemeier and tracking upstream
[`moinulmoin/voicetypr`](https://github.com/moinulmoin/voicetypr). It does
**not** speak for the upstream project; it constrains only how this fork
evolves.

## Core Principles

### I. Upstream Fidelity (NON-NEGOTIABLE)

This repository is a personal fork, not a competing product. Every change
MUST minimize divergence from upstream so that periodic rebases on
`moinulmoin/voicetypr@main` remain low-friction.

- Changes MUST be small, isolated, and rebaseable. Refactors that touch
  unrelated upstream files are prohibited unless they are unavoidable to
  ship the fork-local feature.
- New features MUST clear a "would I send this upstream?" check. If the
  answer is yes, prefer contributing it upstream first; only carry it
  locally when upstream has declined or the feature is intrinsically
  personal (e.g., bypassed license gate).
- Renames, file moves, and broad reformatting in upstream-owned code are
  forbidden — they create rebase conflicts with no offsetting value.

**Rationale**: A fork that drifts becomes a maintenance burden and loses
upstream bug fixes. Discipline here is what keeps this fork cheap.

### II. Privacy & Offline-First

VoiceTypr's core promise is that audio never leaves the device. This fork
MUST preserve that guarantee for the transcription path.

- Local transcription (Whisper / Parakeet) MUST remain fully offline.
- Network calls are permitted ONLY for: (a) optional AI-enhancement
  features the user explicitly opts into (Groq / Gemini), (b) model
  downloads, (c) auto-update checks. Any new outbound call MUST be
  documented and user-toggleable.
- Telemetry, analytics, and crash reporting that exfiltrate user content
  are prohibited. Anonymous, aggregated, opt-in metrics MAY be considered
  but require explicit constitutional amendment before adoption.

**Rationale**: Voice is sensitive. The privacy posture is a load-bearing
property of the product, not a marketing line.

### III. Native Performance & Lean Dependencies

Performance budgets and dependency hygiene are tighter than typical web
apps because this is a desktop tool that runs on hot paths (audio capture,
inference, text insertion).

- Hot paths (audio capture, model inference, text insertion) MUST stay in
  Rust. Do not move them to JavaScript for convenience.
- Frontend bundles MUST stay minimal. Adding a runtime dependency (npm or
  cargo) requires a justification: what does it replace, what is its
  size, and is a smaller alternative viable?
- No premature abstraction. Three similar lines beat a speculative helper.
  Abstractions are introduced when the third concrete caller exists, not
  when a second one is imagined.

**Rationale**: This is a desktop app users invoke dozens of times an hour;
startup, latency, and binary size are user-visible.

### IV. Type Safety & Quality Gates

The codebase must remain machine-checkable end-to-end.

- TypeScript: strict mode, no `any` introductions. Existing `any` may be
  tolerated transiently but new code MUST be typed.
- Rust: warnings-clean. No `#[allow(...)]` without an inline comment
  explaining why.
- All PRs MUST pass `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `cargo test` locally before merge. Pre-merge bypass (`--no-verify`,
  disabled hooks) is forbidden absent an explicit one-line justification
  in the PR description.
- UI changes that cannot be verified by automated tests MUST be tested
  manually in `pnpm tauri dev` before being declared done; the PR
  description states the manual steps performed.

**Rationale**: This fork is maintained part-time. Automated gates do the
work a full-time reviewer otherwise would.

### V. Personal-Use Disclosure

Because the fork bypasses the upstream license gate locally, the project's
public-facing surfaces MUST make its status unambiguous.

- README.md, the in-app About section, and any new public-facing copy
  MUST: (a) state this is a personal fork, (b) credit upstream by name
  and link, (c) direct users wanting a supported build to upstream.
- The fork MUST NOT publish signed/notarized release binaries or operate
  any download channel implying it is a product.
- The license-gate bypass MUST stay local. It MUST NOT be re-exposed as a
  selling point, packaged for redistribution, or framed as "free
  VoiceTypr." If upstream changes its licensing model, this principle is
  re-evaluated before next rebase.

**Rationale**: AGPL plus respect for the upstream maintainer require the
fork to be honest about what it is and to avoid undercutting the original
product.

## Technology & Compliance Constraints

- **Stack**: Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS v4 +
  shadcn/ui. Stack changes require constitutional amendment.
- **Target platform**: macOS 13+ is the supported target for fork-local
  features. Windows-specific upstream code MUST keep compiling but is not
  manually tested in this fork.
- **License**: AGPL v3, inherited from upstream. All modifications in this
  fork are released under the same license. License headers and
  `LICENSE.md` are not edited.
- **Secrets**: No API keys, signing certificates, or production tokens are
  committed. `.env.example` files use placeholders only. User-provided
  Groq/Gemini keys are stored via the OS keychain through Tauri, never in
  plaintext config.
- **Upstream tracking**: The fork pins to a known upstream version
  (currently v1.12.3). The pinned version is recorded in README and
  updated when rebasing.

## Development Workflow & Quality Gates

- **Spec-driven changes**: Non-trivial features (anything beyond a
  single-file tweak) use the `.specify/` workflow:
  `/speckit-specify` → `/speckit-clarify` (when needed) →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Each phase
  produces an artifact under `specs/<###-feature>/`.
- **Branching**: Feature branches use the `feat/<short-slug>` or
  `fix/<short-slug>` form. Direct commits to `main` are reserved for
  trivial doc/chore changes.
- **Commits**: Conventional Commits style (`feat:`, `fix:`, `chore:`,
  `docs:`, `refactor:`), matching upstream convention to keep rebases
  clean.
- **Pre-merge gate**: `pnpm lint && pnpm typecheck && pnpm test` and
  `cd src-tauri && cargo test` MUST all pass. UI-affecting PRs include a
  manual-test note as required by Principle IV.
- **Rebasing**: When pulling upstream, prefer `git rebase` over `git
  merge` to keep history linear and make fork-local changes auditable.
  Conflicts are resolved in favor of preserving fork-local intent without
  reintroducing upstream code that was deliberately removed.

## Governance

- This constitution supersedes ad-hoc decisions made elsewhere in this
  fork (CLAUDE.md, in-code comments, prior PRs). Where they conflict, the
  constitution wins and the conflicting source is updated.
- **Amendments**: Made via a PR that (a) edits this file, (b) bumps the
  version below per the rules, (c) updates the Sync Impact Report comment
  at the top, (d) updates any dependent template referenced in that
  report.
- **Versioning policy** (semantic):
  - **MAJOR**: A principle is removed or its meaning materially
    contradicts the prior version.
  - **MINOR**: A new principle or section is added, or guidance is
    materially expanded.
  - **PATCH**: Wording, clarification, typo, or non-semantic refinement.
- **Compliance review**: Every PR description states, in one line, which
  principles it touches and how it stays compliant. Reviewers (including
  AI assistants) verify that line before approving.
- **Runtime guidance**: For day-to-day development guidance that should
  not live in the constitution itself, see `CLAUDE.md` at the repository
  root.

**Version**: 1.0.0 | **Ratified**: 2026-05-04 | **Last Amended**: 2026-05-04
