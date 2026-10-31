"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Ellipsis, Filter, KanbanSquare, LogOut, Radio, SlidersHorizontal, Sun } from "lucide-react";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";

// bottom: shown in the phone tab bar; the rest live in the "More" sheet (7 tabs do not fit 390 px).
const LINKS = [
  { href: "/", label: "Today", Icon: Sun, bottom: true },
  { href: "/pipeline", label: "Pipeline", Icon: KanbanSquare, bottom: true },
  { href: "/filtered", label: "Filtered", Icon: Filter, bottom: true },
  { href: "/sources", label: "Sources", Icon: Radio, bottom: false },
  { href: "/config", label: "Config", Icon: SlidersHorizontal, bottom: false },
  { href: "/runs", label: "Runs", Icon: Activity, bottom: true },
] as const;

type Variant = "top" | "bottom";

const BOTTOM_ITEM = "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.75rem] font-medium text-muted-foreground";

// "/" is Today; match detail pages (/m/[id]) belong to it too.
function isActive(active: string | null, href: string): boolean {
  if (active === null) return false;
  if (href === "/") return active === "/" || active.startsWith("/m/");
  return active === href || active.startsWith(href + "/");
}

// Phones: the sections without a tab, theme and Sign out.
function MoreSheet({ active }: { active: string | null }) {
  const extra = LINKS.filter((l) => !l.bottom);
  const on = extra.some((l) => isActive(active, l.href));
  return (
    <Sheet>
      <SheetTrigger className={cn(BOTTOM_ITEM, on && "text-foreground")}>
        <Ellipsis className="size-5" aria-hidden />
        More
      </SheetTrigger>
      <SheetContent side="bottom" className="gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="p-0">
          <SheetTitle>More</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2">
          {extra.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(active, href) ? "page" : undefined}
              className={cn(buttonVariants({ variant: isActive(active, href) ? "secondary" : "outline" }), "h-11 justify-start")}
            >
              <Icon aria-hidden />
              {label}
            </Link>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Theme</p>
          <ThemeToggle />
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" className="h-11 w-full">
            <LogOut aria-hidden />
            Sign out
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function NavLinks({ variant, active }: { variant: Variant; active: string | null }) {
  const links = variant === "bottom" ? LINKS.filter((l) => l.bottom) : LINKS;
  return (
    <>
      {links.map(({ href, label, Icon }) => {
        const on = isActive(active, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={
              variant === "top"
                ? cn(
                    "rounded-md px-2.5 py-1.5 text-[0.9375rem] text-muted-foreground hover:text-foreground",
                    on && "font-semibold text-foreground",
                  )
                : cn(BOTTOM_ITEM, on && "text-foreground")
            }
          >
            {variant === "bottom" ? <Icon className="size-5" aria-hidden /> : null}
            {label}
          </Link>
        );
      })}
      {variant === "bottom" ? <MoreSheet active={active} /> : null}
    </>
  );
}

// Reads the pathname to mark the current section. Render inside <Suspense>:
// with Cache Components on, usePathname suspends on routes with dynamic params.
export function ConsoleNav({ variant }: { variant: Variant }) {
  return <NavLinks variant={variant} active={usePathname()} />;
}

// Suspense fallback: same links, no current marker.
export function ConsoleNavStatic({ variant }: { variant: Variant }) {
  return <NavLinks variant={variant} active={null} />;
}
