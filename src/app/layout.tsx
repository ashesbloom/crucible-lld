import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { ReviewerBanner } from "@/components/ReviewerBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crucible — LLD practice that changes the requirements",
  description:
    "Most tools grade the design you wrote. Crucible changes the requirements and measures what breaks.",
};

const NAV = [
  { href: "/problems", label: "practice" },
  { href: "/history", label: "history" },
  { href: "/design", label: "design" },
  { href: "/research", label: "research" },
  { href: "/ai-usage", label: "ai usage" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ReviewerBanner />

        <header style={{ borderBottom: "1px solid var(--ink-600)" }}>
          <div
            className="shell"
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "1.5rem",
              padding: "0.7rem 0",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <Link href="/" className="ident" style={{ textDecoration: "none", fontWeight: 600 }}>
              crucible
            </Link>

            <nav style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="small dim">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main>
          <Reveal>{children}</Reveal>
        </main>
      </body>
    </html>
  );
}
