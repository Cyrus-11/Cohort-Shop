import type { ReactNode } from "react";

type StatusPanelProps = { title: string; children: ReactNode };

export function StatusPanel({ title, children }: StatusPanelProps) {
  return (
    <section className="status-panel" aria-labelledby="status-title">
      <h2 id="status-title">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
