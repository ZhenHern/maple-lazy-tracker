import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Nunito, Pixelify_Sans } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
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

// Metadata becomes the <title> and the tags that link previews read. The
// share picture is app/opengraph-image.tsx; metadataBase turns its path into
// the full URL that Discord and others need.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${pixelFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Web Analytics: counts page views without cookies. It only
            reports from a Vercel deployment, never from local runs. */}
        <Analytics />
      </body>
    </html>
  );
}
