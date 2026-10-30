"use client";

import { useT } from "../lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (children: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TABS = [
  { href: "/", label: "Home", icon: icon(<path d="M4 11l8-7 8 7v9H4z" />) },
  { href: "/build", label: "Projects", icon: icon(<path d="M3 7h6l2 2h10v10H3z" />) },
  {
    href: "/gallery",
    label: "Gallery",
    icon: icon(
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    href: "/find",
    label: "Find",
    icon: icon(
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l5 5" />
      </>,
    ),
  },
];

const SHOWN = ["/", "/gallery", "/find"];

export default function TabBar() {
  const t = useT();
  const path = usePathname();
  if (!SHOWN.includes(path)) return null;

  const tab = (item: (typeof TABS)[number]) => (
    <Link key={item.href} href={item.href} className="tab-item" aria-current={path === item.href ? "page" : undefined}>
      <span className="tab-pill">{item.icon}</span>
      {t(item.label)}
    </Link>
  );

  return (
    <nav className="tabbar" aria-label={t("Main")}>
      {TABS.slice(0, 2).map(tab)}
      <Link href="/#ask" className="tab-new" aria-label={t("New project")}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      {TABS.slice(2).map(tab)}
    </nav>
  );
}
