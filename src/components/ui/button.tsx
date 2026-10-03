import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * One responsive button for the whole app.
 *
 * Touch-first: every size is at least 44×44 on phones (Apple HIG) and collapses
 * to the denser instrument-panel height from `lg` up, where a pointer is used.
 */
const button = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'border border-amber/60 bg-amber text-ink hover:bg-amber-lt hover:border-amber-lt active:bg-amber-dk',
        secondary: 'border border-line bg-rail/60 text-dim hover:border-engrave hover:bg-rail hover:text-txt',
        ghost: 'border border-transparent text-mute hover:bg-white/[0.04] hover:text-txt',
        outline: 'border border-amber/45 text-amber hover:bg-amber/[0.1]',
        danger: 'border border-red/50 text-red hover:bg-red/[0.12]',
        'danger-solid': 'border border-red/60 bg-red text-ink hover:bg-red/85',
      },
      size: {
        sm: 'h-10 px-3 text-[10px] lg:h-8',
        md: 'h-11 px-4 text-[10.5px] lg:h-9',
        lg: 'h-12 px-5 text-[11px] lg:h-10',
        icon: 'h-11 w-11 p-0 lg:h-9 lg:w-9',
        'icon-sm': 'h-10 w-10 p-0 lg:h-8 lg:w-8',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size, block }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export type ButtonVariant = NonNullable<VariantProps<typeof button>['variant']>;

/** Square icon-only control with a guaranteed 44px touch target on phones. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; size?: 'icon' | 'icon-sm' }>(
  ({ label, className, variant = 'ghost', size = 'icon', ...props }, ref) => (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} className={cn('shrink-0', className)} {...props} />
  ),
);
IconButton.displayName = 'IconButton';
