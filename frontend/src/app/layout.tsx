import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lume — seu tutor de idiomas",
  description: "Protótipo navegável do AI Language Tutor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
