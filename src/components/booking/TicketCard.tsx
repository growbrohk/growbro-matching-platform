/**
 * TicketCard - Unified ticket card component
 * Single source of truth for ticket display matching reference design exactly
 * Used for:
 * - Booking success page display
 * - PDF/ticket image capture
 * - Any ticket rendering needs
 */

import { QRCodeSVG } from 'qrcode.react';
import { formatTicketDateTime } from '@/lib/utils/datetime';
import { useEffect, useRef, useState } from 'react';

export interface TicketCardProps {
  // Event info
  eventName: string;
  dateTime: string; // ISO date string (start_at)
  venue: string;
  
  // Ticket info
  checkinCode: string; // order_no or booking code
  qrValue: string; // QR code value (ticket.qr_code)
  
  // Participant info
  participantName: string; // Full name (first_name + last_name)
  price: number; // Ticket price (0 means FREE)
  seatNumber?: string | null; // Seat number (null/undefined means FREE)
  
  // Currency for price display
  currency?: string; // Default: 'HKD'
  
  // Styling
  className?: string;
  
  // Capture mode - removes marginBottom for isolated capture
  captureMode?: boolean;
}

/**
 * Format price for display
 * - If price === 0 or null/undefined => "FREE"
 * - Else format with currency symbol
 */
function formatPrice(price: number, currency: string = 'HKD'): string {
  if (!price || price === 0) {
    return 'FREE';
  }
  
  // Currency symbols
  const currencySymbols: Record<string, string> = {
    'HKD': 'HK$',
    'USD': '$',
    'GBP': '£',
    'EUR': '€',
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
  
  return (
    <div className={`flex flex-col items-center ${className}`} style={{ backgroundColor: '#000000' }}>
      {/* Top title area (outside white card) */}
      <div className="w-full flex flex-col items-center py-8 px-4">
        <h1 className="text-3xl font-bold text-white mb-2 uppercase tracking-tight">
          THIS IS YOUR TICKET
        </h1>
        <p className="text-sm text-white/90 text-center">
          Please show it on your phone when you arrive at the venue
        </p>
      </div>
      
      {/* White card container */}
      <div
        className="w-full max-w-[800px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: '800px',
          marginBottom: captureMode ? '0' : '2rem',
        }}
      >
        {/* Card header row */}
        <div className="flex items-start justify-between px-8 pt-8 pb-6">
          {/* Left: Growbro horizontal logo only (bigger) */}
          <div className="flex items-center">
            <img
              src="/growbro-logo-horizontal.png"
              alt="growbro"
              className="h-[32px] w-auto"
              style={{ maxWidth: '200px' }}
            />
          </div>
          
          {/* Right: Checkin code */}
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              CHECKIN CODE
            </span>
            <span className="text-xl font-bold text-black">
              {checkinCode}
            </span>
          </div>
        </div>
        
        {/* QR Code section */}
        <div className="flex justify-center px-8 pb-6">
          <div className="p-4 bg-white border-2 border-black rounded-lg">
            <QRCodeSVG
              value={qrValue}
              size={280}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>
        
        {/* Event info block */}
        <div className="px-8 pb-6 space-y-4">
          {/* Event Name */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              EVENT NAME
            </p>
            <p className="text-lg font-bold text-black">
              {eventName}
            </p>
          </div>
          
          {/* Date and Time */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              DATE AND TIME
            </p>
            <p className="text-lg font-bold text-black">
              {formattedDateTime}
            </p>
          </div>
          
          {/* Venue */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              VENUE
            </p>
            <p className="text-lg font-bold text-black">
              {venue}
            </p>
          </div>
        </div>
        
        {/* Tear line divider with cutouts */}
        <div className="relative py-6">
          {/* Container for dashed line and cutouts */}
          <div className="relative mx-8">
            {/* Dashed line */}
            <div className="border-t-2 border-dashed border-gray-400" />
            
            {/* Left semicircle cutout - positioned at card edge */}
            <div
              className="absolute top-[-8px]"
              style={{
                left: '-32px',
                width: '16px',
                height: '16px',
                backgroundColor: '#000000',
                borderRadius: '50%',
                border: '2px solid #9CA3AF',
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
              }}
            />
            {/* Right semicircle cutout - positioned at card edge */}
            <div
              className="absolute top-[-8px]"
              style={{
                right: '-32px',
                width: '16px',
                height: '16px',
                backgroundColor: '#000000',
                borderRadius: '50%',
                border: '2px solid #9CA3AF',
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
              }}
            />
          </div>
        </div>
        
        {/* Bottom section */}
        <div className="px-8 pb-8 flex items-end justify-between">
          {/* Left block: Participant name + price */}
          <div className="flex-1 space-y-4">
            {/* Participant Name */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                PARTICIPANT NAME
              </p>
              <p className="text-lg font-bold text-black uppercase">
                {participantName}
              </p>
            </div>
            
            {/* Ticket Price */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                TICKET PRICE
              </p>
              <p className="text-lg font-bold text-black">
                {formattedPrice}
              </p>
            </div>
          </div>
          
          {/* Right block: Seat number */}
          <div className="flex flex-col items-end">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              SEAT NUMBER
            </p>
            <p className="text-5xl font-bold text-black">
              {displaySeatNumber}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TicketCardPreview - Responsive wrapper for TicketCard
 * Scales down the 800px ticket on mobile without clipping
 * Keeps the actual ticket at 800px for capture quality
 */
export function TicketCardPreview({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !ticketRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const ticketWidth = 800; // Fixed ticket width
      const padding = 32; // Account for container padding (px-4 = 16px each side)
      const availableWidth = containerWidth - padding;
      
      const newScale = Math.min(1, availableWidth / ticketWidth);
      setScale(newScale);

      // Measure ticket height and set wrapper height to prevent overlap
      const ticketHeight = ticketRef.current.getBoundingClientRect().height;
      setWrapperHeight(ticketHeight * newScale);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`w-full flex justify-center ${className}`}
      style={{
        minHeight: wrapperHeight ? `${wrapperHeight}px` : 'auto',
      }}
    >
      <div
        ref={ticketRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          width: '800px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

