import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export interface ProductInfoAccordionProps {
  description?: string;
  productDetails?: string;
  sizeAndFit?: string;
  /**
   * When true (e.g. PDP), all non-empty sections start expanded.
   * When false (e.g. checkout), all start collapsed to save space.
   */
  defaultAllOpen?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Description / Product Details / Size & Fit — same structure as the public product page.
 * Returns null when all inputs are empty.
 */
export default function ProductInfoAccordion({
  description = '',
  productDetails = '',
  sizeAndFit = '',
  defaultAllOpen = true,
  className,
  'aria-label': ariaLabel = 'Product information',
}: ProductInfoAccordionProps) {
  const descriptionText = (description || '').trim();
  const productDetailsT = (productDetails || '').trim();
  const sizeFitT = (sizeAndFit || '').trim();

  const sections = useMemo(() => {
    const out: { id: string; title: string; body: string }[] = [];
    if (descriptionText) {
      out.push({ id: 'description', title: 'Description', body: descriptionText });
    }
    if (productDetailsT) {
      out.push({ id: 'product-details', title: 'Product Details', body: productDetailsT });
    }
    if (sizeFitT) {
      out.push({ id: 'size-fit', title: 'Size & Fit', body: sizeFitT });
    }
    return out;
  }, [descriptionText, productDetailsT, sizeFitT]);

  if (sections.length === 0) return null;

  const allSectionIds = sections.map((s) => s.id);

  return (
    <section
      className={className}
      style={{ borderColor: 'rgba(0,0,0,0.1)' }}
      aria-label={ariaLabel}
    >
      <Accordion
        type="multiple"
        defaultValue={defaultAllOpen ? allSectionIds : []}
        className="w-full"
      >
        {sections.map((s) => (
          <AccordionItem key={s.id} value={s.id} className="border-muted">
            <AccordionTrigger
              className="text-base hover:no-underline py-4"
              style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
            >
              {s.title}
            </AccordionTrigger>
            <AccordionContent>
              <div
                className="prose prose-sm max-w-none whitespace-pre-wrap pb-2"
                style={{ color: 'rgba(15,31,23,0.85)' }}
              >
                {s.body}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
