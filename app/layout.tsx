import type { Metadata, Viewport } from "next";
import { Caveat, DM_Sans, Fraunces, Space_Mono } from "next/font/google";
import "./globals.css";
import "./v2.css";
import "./fx.css";
import "./v3.css";
import Shell from "../components/Shell";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif" });
const mono = Space_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono" });
const hand = Caveat({ subsets: ["latin"], weight: "600", variable: "--font-hand" });

export const metadata: Metadata = {
  title: "StepSight",
  description: "A camera guide that highlights the exact part and checks every step.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF7EF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        {children}
        <Shell />
      </body>
    </html>
  );
}
