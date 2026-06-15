export function LoadingSkeleton() {
  return (
    <main className="fd-app-shell">
      <div className="fd-main" style={{ marginLeft: 0 }}>
        <div className="fd-content">
          <div className="fd-grid three">
            <div className="fd-skeleton" style={{ height: 120 }} />
            <div className="fd-skeleton" style={{ height: 120 }} />
            <div className="fd-skeleton" style={{ height: 120 }} />
          </div>
          <div className="fd-grid two" style={{ marginTop: 16 }}>
            <div className="fd-skeleton" style={{ height: 420 }} />
            <div className="fd-skeleton" style={{ height: 420 }} />
          </div>
        </div>
      </div>
    </main>
  );
}
