"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "crucible.reviewer-banner.dismissed";

/**
 * The single most useful thing on the site for its actual first audience.
 *
 * Someone reviewing this has a stack of submissions and a few minutes. The tour
 * is a deep link into a seeded account with three attempts already behind it,
 * so nothing important is hidden behind an empty state.
 */
export function ReviewerBanner() {
  const [hidden, setHidden] = useState(true);

  // Read after mount: localStorage does not exist during server rendering, and
  // reading it in render would mismatch the server-rendered markup.
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* private mode; the banner simply returns next visit */
    }
  }

  if (hidden) return null;

  return (
    <div style={{ background: "var(--ink-700)", borderBottom: "1px solid var(--ink-600)" }}>
      <div
        className="shell small"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.55rem 0",
          flexWrap: "wrap",
        }}
      >
        <span className="chip impact-unchanged">reviewing this?</span>
        <span className="dim" style={{ flex: 1, minWidth: 220 }}>
          Three minutes, five screens, nothing to set up.
        </span>
        <Link href="/tour" className="btn btn-ghost" style={{ padding: "0.25rem 0.6rem" }}>
          take the tour
        </Link>
        <button onClick={dismiss} className="btn btn-quiet" aria-label="Dismiss">
          dismiss
        </button>
      </div>
    </div>
  );
}
