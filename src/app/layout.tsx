import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AmbientCanvas } from "@/components/layout/AmbientCanvas";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Jobform",
  description: "AI customer support with deterministic refund policy.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="app-layout">
        <AppSidebar />
        <div className="main-content">
          <AmbientCanvas />
          <div className="main-content-inner">{children}</div>
        </div>
      </body>
    </html>
  );
}
