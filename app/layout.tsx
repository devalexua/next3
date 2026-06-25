import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next3",
  description: "Real-time World Cup 3-minute prediction game",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
