import type { Metadata } from 'next';
import './globals.css';
import { TRPCProvider } from '@/trpc/provider';
import { NavBar } from '@/components/nav-bar';

export const metadata: Metadata = {
  title: 'Agent编排引擎 — 控制台',
  description: '多专家Agent协作编排引擎',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">
        <TRPCProvider>
          <div className="relative flex min-h-screen flex-col">
            <NavBar />
            <main className="flex-1 container mx-auto py-6 px-4">{children}</main>
          </div>
        </TRPCProvider>
      </body>
    </html>
  );
}
