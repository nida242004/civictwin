import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Praesidium — Neighborhood Safety Simulation & Planning",
  description:
    "Build or import a neighborhood, add street lighting, CCTV and patrol routes, run a deterministic nighttime simulation, compare interventions, and export a professional report. Local-first, browser-based, India-first defaults.",
  keywords: [
    "Praesidium",
    "neighborhood safety",
    "urban planning",
    "simulation",
    "street lighting",
    "CCTV coverage",
    "patrol planning",
  ],
  authors: [{ name: "Praesidium" }],
  openGraph: {
    title: "Praesidium — Neighborhood Safety Simulation & Planning",
    description:
      "Deterministic nighttime safety simulation with modeled lighting and CCTV coverage, patrol response analytics, and professional PDF reports.",
    siteName: "Praesidium",
    type: "website",
  },
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
