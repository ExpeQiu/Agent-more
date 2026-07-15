'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Layers, Play, BarChart3, Settings } from 'lucide-react';

const navItems = [
  { href: '/scenes', label: '场景管理', icon: Layers },
  { href: '/execute', label: '执行测试', icon: Play },
  { href: '/results', label: '执行记录', icon: BarChart3 },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <div className="flex items-center gap-2 mr-8">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">AE</span>
          </div>
          <span className="font-semibold text-sm">Agent编排引擎</span>
        </div>

        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/health"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border hover:bg-muted transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            系统正常
          </Link>
        </div>
      </div>
    </header>
  );
}
