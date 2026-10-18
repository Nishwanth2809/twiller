
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, themeBootstrapScript } from "@/context/ThemeContext";
import CookieNotice from "@/components/CookieNotice";
import BackToTop from "@/components/BackToTop";
import Script from "next/script";

import { ToastProvider } from "@/context/ToastContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F19" },
  ],
};

export const metadata: Metadata = {
  title: "Twiller — Conversations connect us",
  description: "A space for conversations, connection, and discovery. Share posts and keep up with people you follow.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><Script id="twiller-theme-init" strategy="beforeInteractive">{themeBootstrapScript}</Script></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              {children}
              <CookieNotice />
              <BackToTop />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
