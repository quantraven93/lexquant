import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import "./globals.css";

const firaCode = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LexQuant - Indian Court Case Intelligence Terminal",
  description:
    "Bloomberg-style terminal for tracking cases across Supreme Court, High Courts, and District Courts of India",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${firaCode.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
