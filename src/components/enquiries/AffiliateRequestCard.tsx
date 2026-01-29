import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface AffiliateRequest {
  id: string;
  tracking_link_id: string;
  host_org_id: string;
  affiliate_org_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  tracking_link: {
    slug: string;
    label: string | null;
    destination_url: string;
    commission_rate: number;
    start_date: string;
    end_date: string;
  };
  host_org: {
    name: string;
    slug?: string;
  };
}

interface AffiliateRequestCardProps {
  request: AffiliateRequest;
  onStatusChange: () => void;
}

export default function AffiliateRequestCard({ request, onStatusChange }: AffiliateRequestCardProps) {
  const { toast } = useToast();
  const [isResponding, setIsResponding] = useState(false);

  const handleRespond = async (newStatus: 'accepted' | 'rejected') => {
    setIsResponding(true);
    try {
      const { error } = await (supabase.from('affiliate_requests' as any) as any)
        .update({ status: newStatus })
        .eq('id', request.id);

      if (error) throw error;

      toast({
        title: newStatus === 'accepted' ? 'Request Accepted' : 'Request Rejected',
        description: newStatus === 'accepted' 
          ? 'The affiliate link is now active.' 
          : 'The request has been rejected.',
      });

      onStatusChange();
    } catch (err: any) {
      console.error('Error responding to affiliate request:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to respond to request',
        variant: 'destructive',
      });
    } finally {
      setIsResponding(false);
    }
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
    try {
      const start = new Date(request.tracking_link.start_date);
      const end = new Date(request.tracking_link.end_date);
      return `${format(start, 'EEE, d MMM')} – ${format(end, 'EEE, d MMM yyyy')}`;
    } catch {
      return null;
    }
  };

  const hostName = request.host_org.name;
  const initials = hostName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const commissionPercent = (request.tracking_link.commission_rate * 100).toFixed(1);
  const previewUrl = `${window.location.origin}/r/${request.tracking_link.slug}`;
  const period = formatPeriod();

  return (
    <Card 
      className="rounded-2xl border p-4"
      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
    >
      <div className="flex gap-4">
        {/* Left: Avatar */}
        <div className="flex-shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-muted text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Host Name */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm" style={{ color: '#0F1F17' }}>
              {hostName}
            </span>
            <Badge variant="outline" className="text-xs">
              Affiliate Request
            </Badge>
          </div>

          {/* Row 2: Destination */}
          <div className="mb-1">
            <span className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
              {request.tracking_link.label || request.tracking_link.destination_url}
            </span>
          </div>

          {/* Row 3: Period */}
          {period && (
            <div className="mb-1">
              <span className="text-xs" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {period}
              </span>
            </div>
          )}

          {/* Row 4: Commission Rate & Link Preview */}
          <div className="mb-2 space-y-1">
            <div className="text-xs" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Commission: <span className="font-semibold">{commissionPercent}%</span>
            </div>
            <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              Link: <code className="font-mono text-xs">{previewUrl}</code>
            </div>
          </div>

          {/* Action Buttons */}
          {request.status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => handleRespond('accepted')}
                disabled={isResponding}
                className="flex-1"
              >
                {isResponding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Accept'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRespond('rejected')}
                disabled={isResponding}
                className="flex-1"
              >
                Reject
              </Button>
            </div>
          )}

          {request.status === 'accepted' && (
            <Badge className="bg-green-600 text-white mt-2">
              Accepted
            </Badge>
          )}

          {request.status === 'rejected' && (
            <Badge variant="secondary" className="mt-2">
              Rejected
            </Badge>
          )}
        </div>

        {/* Right: Date */}
        <div className="flex-shrink-0">
          <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {formatDate(request.created_at)}
          </div>
        </div>
      </div>
    </Card>
  );
}
