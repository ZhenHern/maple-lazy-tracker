import type { Metadata } from "next";
import { Nunito, Pixelify_Sans } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and self-hosts them, so the browser
// never calls Google and there is no layout shift while fonts load.
const bodyFont = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

const pixelFont = Pixelify_Sans({
  variable: "--font-pixel-face",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lazy Tracker",
  description: "What is actually worth doing in the latest Global MapleStory patch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${pixelFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
