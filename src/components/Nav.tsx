"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "TODAY" },
  { href: "/pages", label: "PAGES" },
  { href: "/idea-vault", label: "IDEA VAULT" },
  { href: "/queue", label: "CONTENT QUEUE" },
  { href: "/performance", label: "PERFORMANCE" },
  { href: "/settings", label: "SETTINGS" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="topnav">
      <Link href="/today" className="brand">
        Human Nature Engine
      </Link>
      {LINKS.map((l) => {
        const active =
          pathname === l.href ||
          (l.href !== "/today" && pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? "active" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
