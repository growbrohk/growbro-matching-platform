/**
 * TicketCard - Unified ticket card component
 * Single source of truth for ticket display matching reference design exactly
 * Used for:
 * - Booking success page display
 * - PNG download (html2canvas)
 * - Any ticket rendering needs
 *
 * FIXED:
 * - Black is now the FULL ticket canvas (like reference)
 * - White card is INSIDE black with padding (no “black bar sandwich”)
 * - Title is part of the same canvas
 * - Logo is ~1.5x bigger
 * - Preview scaling keeps the whole ticket as ONE component on mobile
 */

import { QRCodeSVG } from 'qrcode.react';
import { formatTicketDateTime } from '@/lib/utils/datetime';
import React, { useEffect, useRef, useState } from 'react';

export interface TicketCardProps {
  eventName: string;
  dateTime: string;
  venue: string;

  checkinCode: string;
  qrValue: string;

  participantName: string;
  price: number;
  seatNumber?: string | null;

  currency?: string;
  className?: string;
  captureMode?: boolean;
}

function formatPrice(price: number, currency: string = 'HKD'): string {
  if (!price || price === 0) return 'FREE';

  const currencySymbols: Record<string, string> = {
    HKD: 'HK$',
    USD: '$',
    GBP: '£',
    EUR: '€',
  };

  const symbol = currencySymbols[currency.toUpperCase()] || currency;
  return `${symbol}${price.toFixed(0)}`;
}

export default function TicketCard({
  eventName,
  dateTime,
  venue,
  checkinCode,
  qrValue,
  participantName,
  price,
  seatNumber,
  currency = 'HKD',
  className = '',
  captureMode = false,
}: TicketCardProps) {
  const formattedDateTime = formatTicketDateTime(dateTime);
  const formattedPrice = formatPrice(price, currency);
  const displaySeatNumber = seatNumber || 'FREE';

  /**
   * IMPORTANT LAYOUT:
   * - Outer canvas is fixed 800px width and BLACK (like your reference screenshot)
   * - We add black padding so the white card sits INSIDE the black
   * - No w-screen full-bleed; TicketCardPreview will scale this whole canvas on mobile
   */
  return (
    <div
      className={`bg-black flex flex-col items-center ${className}`}
      style={{
        width: 800,
        // black canvas padding (controls how much black you see around the white card)
        paddingTop: 28,
        paddingBottom: captureMode ? 0 : 28,
        paddingLeft: 28,
        paddingRight: 28,
      }}
    >
      {/* Title INSIDE the black canvas */}
      <div className="w-full flex flex-col items-center" style={{ paddingTop: 6, paddingBottom: 18 }}>
        <h1 className="text-[32px] font-extrabold text-white uppercase tracking-tight text-center leading-none">
          THIS IS YOUR TICKET
        </h1>
        <p className="text-sm text-white/80 text-center mt-2">
          Please show it on your phone when you arrive at the venue
        </p>
      </div>

      {/* White card INSIDE the black canvas (width follows padding) */}
      <div className="w-full bg-white rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <div className="flex items-start justify-between px-10 pt-10 pb-6">
          {/* Logo ~1.5x bigger */}
          <div className="flex items-center">
            <img
              src="/growbro-logo-horizontal.png"
              alt="growbro"
              className="h-[112px] w-auto"
              style={{ maxWidth: 640 }}
            />
          </div>

          <div className="flex flex-col items-end pt-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              CHECKIN CODE
            </span>
            <span className="text-2xl font-black text-black">{checkinCode}</span>
          </div>
        </div>

        {/* QR (make it bigger like reference) */}
        <div className="flex justify-center px-10 pb-6">
          <div className="p-3 bg-white border-2 border-black rounded-2xl">
            <QRCodeSVG value={qrValue} size={520} level="M" includeMargin={false} />
          </div>
        </div>

        {/* Event info */}
        <div className="px-10 pb-6 space-y-3">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              EVENT NAME
            </p>
            <p className="text-[18px] font-extrabold text-black">{eventName}</p>
          </div>

          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              DATE AND TIME
            </p>
            <p className="text-[16px] font-extrabold text-black">{formattedDateTime}</p>
          </div>

          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              VENUE
            </p>
            <p className="text-[16px] font-extrabold text-black">{venue}</p>
          </div>
        </div>

        {/* Perforation */}
        <div className="relative my-4">
          <div className="mx-10 border-t-2 border-dashed border-gray-300" />
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black" />
          <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black" />
        </div>

        {/* Bottom */}
        <div className="px-10 pb-10 flex items-end justify-between">
          <div className="flex-1 space-y-6">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                PARTICIPANT NAME
              </p>
              <p className="text-[18px] font-extrabold text-black uppercase">{participantName}</p>
            </div>

            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                TICKET PRICE
              </p>
              <p className="text-[16px] font-extrabold text-black">{formattedPrice}</p>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
              SEAT NUMBER
            </p>
            <p className="text-[56px] font-black text-black leading-none">{displaySeatNumber}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TicketCardPreview
 * Scales down the fixed 800px ticket canvas on mobile WITHOUT clipping.
 * Keeps proper layout height so the next ticket doesn't overlap.
 */
export function TicketCardPreview({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wrapperHeight, setWrapperHeight] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current || !ticketRef.current) return;

      const cw = containerRef.current.clientWidth;
      const s = Math.min(1, (cw - 16) / 800); // small safe padding
      setScale(s);

      const h = ticketRef.current.scrollHeight;
      setWrapperHeight(h * s);
    };

    update();
    requestAnimationFrame(update);
    setTimeout(update, 120);

    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    ro.observe(ticketRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center" style={{ height: wrapperHeight || 'auto' }}>
      <div
        ref={ticketRef}
        style={{
          width: 800,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
