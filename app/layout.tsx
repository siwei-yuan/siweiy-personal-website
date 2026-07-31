import type { Metadata } from "next";
import { Geist, Geist_Mono, Mulish } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const muli = Mulish({
  variable: "--font-muli",
  subsets: ["latin"],
  weight: "200",
});

export const metadata: Metadata = {
  title: "Siwei Yuan — Selected Work",
  description: "The personal archive of Siwei Yuan: timeline, projects, and signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${muli.variable}`}>
        {children}
      </body>
    </html>
  );
}
