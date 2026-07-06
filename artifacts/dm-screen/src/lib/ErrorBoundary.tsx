import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the DM knows which tile failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

// Catches render-time errors in the subtree — most importantly a *rejected*
// dynamic import. `Suspense` only handles a pending lazy chunk; if the chunk
// fails to fetch (a stale hash after a redeploy with `cleanupOutdatedCaches`,
// or a transient network drop before the service worker precache finishes),
// the rejection throws during render. Without this boundary that would unmount
// the whole dashboard; with it, only the affected tile shows an error and the
// DM can reload to pull the fresh chunks.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for self-hosters debugging a bad deploy.
    console.error("Widget failed to render:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-xs text-gray-400 p-3">
          <span>
            {this.props.label ?? "This widget"} failed to load.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2 py-1 rounded border border-purple-700/60 text-purple-300 hover:bg-purple-900/30 transition-colors"
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
