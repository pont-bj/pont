import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import { ScrollDoux } from "@/components/scroll-doux";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-outfit", display: "swap" });

const url = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pont-landing.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: "Pont — Le backend de ta fintech, en un clic",
  description:
    "Paiements mobile money, portefeuilles, comptabilité et tableau de bord pour votre fintech. Self-host gratuit à vie, Pont Cloud bientôt. FedaPay, PawaPay, PayDunya, Kkiapay.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "Pont" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#4F46E5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable}`}>
      <body><ScrollDoux>{children}</ScrollDoux></body>
    </html>
  );
}
