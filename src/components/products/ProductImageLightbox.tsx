import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type ProductImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title: string;
};

/**
 * Single Dialog for product image zoom. Parent owns open state; use one instance per card/page with many trigger buttons.
 */
export function ProductImageLightbox({ open, onOpenChange, url, title }: ProductImageLightboxProps) {
  const u = url.trim();
  if (!u) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[min(92vw,48rem)] max-h-[90vh] overflow-y-auto p-4 pt-12 gap-3 rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Full-size product photo</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <img
            src={u}
            alt={title}
            className="max-h-[min(75vh,720px)] w-auto max-w-full rounded-lg object-contain"
          />
        </div>
        <p className="text-center text-sm font-medium px-2" style={{ color: '#0F1F17' }}>
          {title}
        </p>
      </DialogContent>
    </Dialog>
  );
}

type ProductImageLightboxTriggerProps = {
  src: string;
  title: string;
  /** e.g. set url then open */
  onOpen: () => void;
  className?: string;
  size?: 'md' | 'sm';
  /** When set, use as the visible image instead of `src` (same click behavior). */
  imageSrcOverride?: string;
} & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>;

/** Button-only: wire onOpen to set lightbox url + open in parent. */
export function ProductImageLightboxTrigger({
  src,
  title,
  onOpen,
  className,
  size = 'md',
  imageSrcOverride,
  'aria-label': ariaLabelProp,
  ...rest
}: ProductImageLightboxTriggerProps) {
  const u = (imageSrcOverride ?? src).trim();
  if (!u) return null;

  const sizeCl =
    size === 'sm'
      ? 'h-12 w-12 rounded-md border'
      : 'h-12 w-12 shrink-0 rounded-md border overflow-hidden';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'shrink-0 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0E7A3A] cursor-zoom-in transition-opacity hover:opacity-90 active:opacity-80',
        sizeCl,
        className,
      )}
      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
      aria-label={ariaLabelProp ?? `View full size: ${title}`}
      {...rest}
    >
      <img src={u} alt="" className="h-full w-full object-cover" />
    </button>
  );
}
