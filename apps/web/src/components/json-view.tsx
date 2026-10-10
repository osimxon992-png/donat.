export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border-2 border-ink/15 bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
