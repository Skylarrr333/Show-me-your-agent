import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropMatch Agent | 303forward",
  description:
    "Evidence-backed property recommendations with verified constraints, transparent trade-offs and human approval.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
