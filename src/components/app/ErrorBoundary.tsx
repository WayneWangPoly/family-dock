import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  stack?: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      stack: error.stack,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Family Dock error boundary:", error, info);
  }

  reset = () => {
    this.setState({
      hasError: false,
      message: "",
      stack: undefined,
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="fd-error-page">
        <section className="fd-error-card">
          <h1 style={{ marginTop: 0 }}>Family Dock hit a screen error</h1>
          <p className="fd-muted">
            The app did not fully crash. You can retry the screen or reload the page.
          </p>

          <div className="fd-alert danger" style={{ marginTop: 14 }}>
            {this.state.message || "Unknown error"}
          </div>

          {this.state.stack && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Technical details</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflow: "auto" }}>
                {this.state.stack}
              </pre>
            </details>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="fd-button primary" onClick={this.reset}>Retry screen</button>
            <button className="fd-button" onClick={() => location.reload()}>Reload app</button>
          </div>
        </section>
      </main>
    );
  }
}
