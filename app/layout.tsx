import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Space_Mono } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif" });
const mono = Space_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "StepSight",
  description: "A camera guide that highlights the exact part and checks every step.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF7EF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
