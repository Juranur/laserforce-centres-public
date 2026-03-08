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
  title: "Laserforce Mission Stats - Global Player Rankings",
  description: "View global player rankings from Laserforce laser tag centers worldwide. Track mission stats, games played, and compete globally.",
  keywords: ["Laserforce", "Laser Tag", "Mission Stats", "Player Rankings", "Global Scoring", "iPlayLaserforce"],
  authors: [{ name: "Laserforce Stats Viewer" }],
  icons: {
    icon: "https://www.iplaylaserforce.com/favicon.ico",
  },
  openGraph: {
    title: "Laserforce Mission Stats",
    description: "Global player rankings from Laserforce laser tag centers worldwide",
    url: "https://www.iplaylaserforce.com/mission-stats/",
    siteName: "Laserforce Mission Stats",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Laserforce Mission Stats",
    description: "Global player rankings from Laserforce laser tag centers worldwide",
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
