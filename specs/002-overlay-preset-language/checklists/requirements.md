# Specification Quality Checklist: Overlay Preset & Language Toggles

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-04
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Two file references in *Context* and *Edge Cases* (`RecordingPill.tsx`,
  `lib/hotkey-conflicts.ts`, `EnhancementPreset` type, `ModelsSection`'s
  `isEnglishOnlyModel`) are intentional anchors so reviewers can locate
  the existing surfaces being extended. They name *where the existing
  behavior lives*, not *how the new feature is implemented*, and follow
  the same precedent set by the 001-Local-AI-Formatting spec
  (which references `AIProviderFactory::create`, `OpenAIProvider`,
  etc.). If a stricter reviewer prefers zero file paths in the spec,
  these can be moved to the plan without changing requirements.
- The two assumptions worth re-checking with the user before
  implementation:
  1. **Two hotkeys vs one** — spec assumes two separate cycle hotkeys
     (one per axis). If the user wants a single hotkey that cycles a
     combined state, the cycle order in FR-002 / FR-005 needs
     redesigning.
  2. **Multi-select replaces single-select** in Models → Spoken
     Language. Spec assumes the existing single-language picker is
     extended to a multi-select with an "active" indicator. If the
     user wants to keep the single picker and add a second "additional
     languages" list elsewhere, FR-003 / Models UI shape changes.
