import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'light' | 'dark';
  children: React.ReactNode;
}

/**
 * PillButton - Pill-shaped button matching the app's chip/tab style
 * 
 * Variants:
 * - light: Light grey background, dark text (for secondary actions like "details")
 * - dark: Dark background, white text (for primary actions like "confirm")
 */
export function PillButton({
  variant = 'light',
  className,
  children,
  ...props
}: PillButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'light'
          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          : 'bg-gray-800 text-white hover:bg-gray-900',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
