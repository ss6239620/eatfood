"use client";
import { Printer } from "lucide-react";
export default function PrintButton() {
  return (
    <button className="button primary" onClick={() => window.print()}>
      <Printer size={15} />
      Print document
    </button>
  );
}
