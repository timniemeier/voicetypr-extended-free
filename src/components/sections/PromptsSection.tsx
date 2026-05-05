// Stub for Phase 2 wiring. Real implementation lands in US1 (T028).
export function PromptsSection() {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-6 py-4 border-b border-border/40">
        <h1 className="text-2xl font-semibold">Prompts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Loading prompt library...
        </p>
      </div>
    </div>
  );
}
