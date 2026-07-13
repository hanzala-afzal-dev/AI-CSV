export default function AppLoading() {
  return (
    <main className="page-shell" aria-live="polite">
      <div className="mb-8 h-24 animate-pulse rounded-md bg-subtle" />
      <div className="h-80 animate-pulse rounded-md bg-subtle" />
      <span className="sr-only">Loading workspace</span>
    </main>
  );
}
