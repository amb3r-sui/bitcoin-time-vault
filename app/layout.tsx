import type { Metadata } from "next";

import { AppProviders } from "@/app/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Bitcoin Time Vault v1",
  description: "OP_NET Testnet dApp for PILL OP_20 Time Vault"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

