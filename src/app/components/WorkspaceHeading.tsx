import type { ReactNode } from "react";

export default function WorkspaceHeading({ label, title, description, icon, children }: {
  label: string;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="study-heading">
      <div className="flex min-w-0 items-start gap-4">
        <div className="study-heading-icon" aria-hidden="true">{icon}</div>
        <div className="min-w-0">
          <p className="study-eyebrow">{label}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h1>
          <div className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{description}</div>
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
