import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hopline — live transit, one place at a time",
  description: "Live status, delays and positions for the trains, flights and buses you actually take. No accounts, no cookies, no ad tracking.",
  applicationName: "Hopline",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        {/* Anonymous, cookieless page-view counts. No user identifiers; see the privacy notes in the README. */}
        <Analytics />
      </body>
    </html>
  );
}
