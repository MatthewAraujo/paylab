"use client";

import {
  Activity,
  BookOpen,
  LayoutDashboard,
  Menu,
  PanelsTopLeft,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: WalletCards },
  { href: "/payments", label: "Payments", icon: PanelsTopLeft },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
  { href: "/system-health", label: "System Health", icon: Activity },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-lg border border-primary/60 bg-primary/10 font-mono font-semibold text-primary">
        P
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">PayLab</p>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Operational Console
        </p>
      </div>
    </div>
  );
}

function Navigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="grid gap-1">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active &&
                "bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--primary)]",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-svh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r bg-card/55 px-4 py-7 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <p className="mb-3 mt-12 px-3 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        <Navigation />
        <div className="mt-auto border-t px-3 pt-5 text-xs leading-5 text-muted-foreground">
          <p className="mb-2 font-semibold uppercase tracking-[0.16em]">
            Financial core
          </p>
          <p>
            Payments describe intent. Ledger Entries provide the accounting
            evidence.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-5 backdrop-blur md:px-10">
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Open navigation"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[19rem] p-5">
                <SheetTitle className="sr-only">PayLab navigation</SheetTitle>
                <Brand />
                <div className="mt-10">
                  <Navigation />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium text-muted-foreground">
              PayLab / Operational Console
            </p>
          </div>
          <Link
            href="/system-health"
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-muted-foreground"
            />
            API status
          </Link>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[96rem] px-5 py-8 md:px-10 md:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
