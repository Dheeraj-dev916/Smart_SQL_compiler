import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn('flex w-full items-center gap-1 overflow-x-auto scroll-thin border-b bg-panel px-2 pt-2', className)}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_2px_0_0_hsl(var(--cyan))]',
        className,
      )}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn('animate-fade-in', className)} {...props} />,
);
TabsContent.displayName = 'TabsContent';
