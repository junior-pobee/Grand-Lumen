import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class StartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; message: string }> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "An unexpected application error occurred." };
  }

  componentDidCatch(error: Error) {
    this.setState({ message: error.message });
  }

  render() {
    if (this.state.failed) {
      return <main style={{ minHeight: "100vh", background: "#06070d", color: "#f4f6ff", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui" }}>
        <section style={{ width: "min(100%, 520px)", padding: 28, border: "1px solid #ffffff22", borderRadius: 18, background: "#11182a" }}>
          <div style={{ color: "#9acbff", fontSize: 12, letterSpacing: 3, fontWeight: 800 }}>GRAND-LUMEN</div>
          <h1 style={{ fontSize: 25 }}>The workspace could not start</h1>
          <p style={{ color: "#aab6ca", lineHeight: 1.7 }}>The application encountered an error while opening. Reload the page. If the problem continues, share this error with the developer.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#ffb8b8", fontSize: 12 }}>{this.state.message}</pre>
          <button onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 9, padding: "12px 18px", background: "#9acbff", color: "#07101e", fontWeight: 800 }}>Reload Grand-Lumen</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StartupBoundary>
      <App />
    </StartupBoundary>
  </React.StrictMode>
);