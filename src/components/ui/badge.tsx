import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-transparent bg-muted text-foreground',
      cyan: 'border-cyan-brand/30 bg-cyan-brand/10 text-cyan-brand',
      indigo: 'border-[hsl(var(--indigo)/0.35)] bg-[hsl(var(--indigo)/0.12)] text-[hsl(var(--indigo))]',
      violet: 'border-violet-brand/30 bg-violet-brand/10 text-violet-brand',
      success: 'border-success/30 bg-success/10 text-success',
      warning: 'border-warning/30 bg-warning/10 text-warning',
      destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
      outline: 'border-border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
