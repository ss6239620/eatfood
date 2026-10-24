import DialogAccessibility from "@/components/dialog-accessibility";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "EatFood — A little more direct.",
  description: "Good food. Great service. Your restaurant, connected.",
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <DialogAccessibility />
      </body>
    </html>
  );
}
