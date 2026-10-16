"use client";

/**
 * Friendly error boundaries for the editor shell and the 3D canvas.
 * A crash in WebGL / three.js / a panel never leaves a blank page: the user
 * gets a short explanation, "Try again" (remounts the subtree), and a way back
 * home. Projects autosave to IndexedDB, so nothing is lost by recovering.
 */

import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** "editor" = full-screen fallback; "canvas" = fits inside the 3D viewport. */
  variant: "editor" | "canvas";
  onHome?: () => void;
}

interface State {
  error: Error | null;
  key: number;
}

function looksLikeWebGL(e: Error | null) {
  return !!e && /webgl|context|gpu|shader|three/i.test(`${e.name} ${e.message}`);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[praesidium] ${this.props.variant} crashed:`, error, info.componentStack?.slice(0, 600));
  }

  private retry = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    const { error, key } = this.state;
    if (!error) return <Fragment key={key}>{this.props.children}</Fragment>;

    const webgl = looksLikeWebGL(error);
    if (this.props.variant === "canvas") {
      return (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-[#eae6dc] p-6">
          <div className="max-w-sm rounded-lg border border-[#dcd6c8] bg-white p-5 text-center shadow-sm">
            <div className="text-sm font-semibold text-[#1d2430]">The 3D view stopped working</div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#5c6470]">
              {webgl
                ? "Your browser's graphics (WebGL) context was lost or is unavailable. Closing other 3D tabs or enabling hardware acceleration usually fixes it."
                : "Something went wrong while drawing the scene."}{" "}
              Your project is saved — panels and results still work.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={this.retry} className="rounded-md bg-[#2e7d5b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#276c4f]">
                Reload 3D view
              </button>
              <button onClick={() => window.location.reload()} className="rounded-md border border-[#dcd6c8] px-3 py-1.5 text-xs text-[#1d2430] hover:bg-[#f1ede4]">
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div role="alert" className="grid h-screen place-items-center bg-[#f7f5f1] p-6 text-[#1d2430]">
        <div className="max-w-md rounded-xl border border-[#dcd6c8] bg-white p-6 text-center shadow-sm">
          <div className="text-base font-semibold">Something went wrong in the workspace</div>
          <p className="mt-2 text-sm leading-relaxed text-[#5c6470]">
            The editor hit an unexpected error. Your project autosaves on this device, so you can safely try again or go back to
            the start and reopen it from “Saved on this device”.
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded bg-[#f7f5f1] px-2 py-1.5 text-left text-[10px] text-[#8a8272]">{String(error.message || error).slice(0, 300)}</pre>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={this.retry} className="rounded-md bg-[#2e7d5b] px-4 py-2 text-sm font-medium text-white hover:bg-[#276c4f]">
              Try again
            </button>
            {this.props.onHome && (
              <button
                onClick={() => {
                  this.props.onHome?.();
                  this.retry();
                }}
                className="rounded-md border border-[#dcd6c8] px-4 py-2 text-sm hover:bg-[#f1ede4]"
              >
                Back to start
              </button>
            )}
            <button onClick={() => window.location.reload()} className="rounded-md border border-[#dcd6c8] px-4 py-2 text-sm hover:bg-[#f1ede4]">
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
