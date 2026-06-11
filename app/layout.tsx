import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wearit — Try before you buy",
  description: "See exactly how any outfit looks on your body — photorealistic, in seconds. No returns.",
  openGraph: {
    title: "Wearit — Try before you buy",
    description: "See exactly how any outfit looks on your body — photorealistic, in seconds.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
