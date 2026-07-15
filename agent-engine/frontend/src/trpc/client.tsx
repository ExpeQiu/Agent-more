'use client';

// tRPC Client Setup — P1-T64
// Type-safe API client with React Query integration

import React from 'react';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server';

export const trpc = createTRPCReact<AppRouter>();

// Error boundary for tRPC errors
export class TRPCErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 border border-destructive rounded-md bg-destructive/10">
            <p className="text-destructive font-medium">API Error</p>
            <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
