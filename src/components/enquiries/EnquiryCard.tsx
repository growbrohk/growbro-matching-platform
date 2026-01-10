import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Mail, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { EnquiryItem } from '@/pages/Enquiries';

interface EnquiryCardProps {
  enquiry: EnquiryItem;
}

// Helper to get thumbnail URL - handles both full URLs and storage paths
function getThumbnailUrl(urlOrPath: string): string {
  // If it's already a full URL, return as-is
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  // Otherwise, assume it's a storage path and get public URL
  const { data } = supabase.storage.from('poster-spaces').getPublicUrl(urlOrPath);
  return data.publicUrl;
}

export default function EnquiryCard({ enquiry }: EnquiryCardProps) {
  // Avatar decision tree
  const getAvatar = () => {
    // System waiting confirmation without brand logo = BIG red "?"
    if (
      enquiry.type === 'system' &&
      enquiry.status === 'waiting_confirmation' &&
      !enquiry.brand?.logoUrl
    ) {
      return (
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-red-100 text-red-600 text-xl font-bold">
            ?
          </AvatarFallback>
        </Avatar>
      );
    }

    // Default: brand logo or fallback initial
    const brandName = enquiry.brand?.name || 'Unknown';
    const initials = brandName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <Avatar className="h-12 w-12 relative">
        {enquiry.brand?.logoUrl ? (
          <AvatarImage src={enquiry.brand.logoUrl} alt={brandName} />
        ) : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          {initials}
        </AvatarFallback>
        {/* Overlay badges */}
        {enquiry.type === 'message' && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border-2 border-background flex items-center justify-center">
            <Mail className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        {enquiry.type === 'sales_order' && enquiry.status === 'confirmed' && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border-2 border-background flex items-center justify-center">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          </div>
        )}
        {enquiry.status === 'waiting_confirmation' && enquiry.brand?.logoUrl && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border-2 border-background flex items-center justify-center">
            <HelpCircle className="h-3 w-3 text-red-600" />
          </div>
        )}
      </Avatar>
    );
  };

  const getLabel = () => {
    if (enquiry.type === 'request') {
      return enquiry.status === 'pending' ? 'Pending Request' : 'Request';
    }
    if (enquiry.type === 'sales_order') {
      return 'Sales Order';
    }
    if (enquiry.status === 'waiting_confirmation') {
      return 'Waiting for Confirmation';
    }
    return null;
  };

  const getSubLabel = () => {
    if (enquiry.type === 'sales_order') {
      const parts: string[] = [];
      if (enquiry.productType) {
        parts.push(enquiry.productType);
      }
      if (enquiry.channel && enquiry.type !== 'system') {
        parts.push(enquiry.channel);
      }
      if (enquiry.spaceType) {
        parts.push(enquiry.spaceType);
      }
      return parts.join(' • ');
    }
    return null;
  };

  const formatDate = (date: string | Date) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return 'Today';
      }
      if (diffDays === 1) {
        return 'Yesterday';
      }
      if (diffDays < 7) {
        return format(dateObj, 'EEE');
      }
      return format(dateObj, 'dd/MM/yyyy');
    } catch {
      return '';
    }
  };

  const formatPeriod = () => {
    if (!enquiry.period?.start || !enquiry.period?.end) return null;
    try {
      const start = typeof enquiry.period.start === 'string' 
        ? new Date(enquiry.period.start) 
        : enquiry.period.start;
      const end = typeof enquiry.period.end === 'string' 
        ? new Date(enquiry.period.end) 
        : enquiry.period.end;
      return `${format(start, 'EEE, d MMM')} – ${format(end, 'EEE, d MMM yyyy')}`;
    } catch {
      return null;
    }
  };

  const brandName = enquiry.brand?.name || 'Unknown';
  const category = enquiry.brand?.category;
  const location = enquiry.brand?.location;
  const itemName = enquiry.item?.name || 'Item';
  const thumbnailUrl = enquiry.item?.thumbnailUrl;
  const period = formatPeriod();
  const previewText = enquiry.previewText;

  return (
    <Card className="rounded-2xl border p-4 hover:shadow-md transition-shadow" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
      <div className="flex gap-4">
        {/* Left: Avatar */}
        <div className="flex-shrink-0">
          {getAvatar()}
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Brand Name + Category/Location */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm" style={{ color: '#0F1F17' }}>
              {brandName}
            </span>
            {(category || location) && (
              <span className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                {[category, location].filter(Boolean).join(' • ')}
              </span>
            )}
          </div>

          {/* Row 2: Item Name */}
          <div className="mb-1">
            <span className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
              {itemName}
            </span>
          </div>

          {/* Row 3: Period (if exists) */}
          {period && (
            <div className="mb-1">
              <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
                <span>{period}</span>
              </span>
            </div>
          )}

          {/* Row 4: Preview Text */}
          {previewText && (
            <div className="mb-1">
              <p className="text-xs line-clamp-2" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {previewText}
              </p>
            </div>
          )}

          {/* Label and Sub-label */}
          {getLabel() && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {getLabel()}
              </Badge>
              {getSubLabel() && (
                <span className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  {getSubLabel()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Date + Thumbnail */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          {/* Date */}
          <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {formatDate(enquiry.date)}
          </div>

          {/* Thumbnail */}
          {thumbnailUrl && (
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img
                src={getThumbnailUrl(thumbnailUrl)}
                alt={itemName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

