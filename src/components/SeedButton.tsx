"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeedButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  async function seed() {
    setState("running");
    try {
      const response = await fetch("/api/demo/seed", { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button onClick={seed} disabled={state === "running"} className="btn btn-primary">
        {state === "running" ? "Running three attempts…" : "load the demo history"}
      </button>
      {state === "error" && (
        <p className="small" style={{ marginTop: "0.6rem", color: "var(--wide)" }}>
          That did not work. Check the server log and try again.
        </p>
      )}
    </>
  );
}
