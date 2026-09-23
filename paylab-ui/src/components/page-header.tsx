import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col items-start justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary/80">
          Operations / {title}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
