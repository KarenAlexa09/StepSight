import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import "./v2.css";
import "./fx.css";
import "./v3.css";
import "./v4.css";
import "./c.css";
import Shell from "../components/Shell";
import TabBar from "../components/TabBar";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "StepSight",
  description: "A camera guide that highlights the exact part and checks every step.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {children}
        <TabBar />
        <Shell />
      </body>
    </html>
  );
}
