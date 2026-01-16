import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { PendingConnection } from '@/hooks/use-pending-connections-count';

export interface ConnectRequestsPreviewCardProps {
  pendingCount: number;
  connections: PendingConnection[];
  onClick: () => void;
}

export default function ConnectRequestsPreviewCard({
  pendingCount,
  connections,
  onClick,
}: ConnectRequestsPreviewCardProps) {
  if (pendingCount === 0) return null;

  return (
    <Card
      className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar stack (up to 3) */}
          <div className="flex -space-x-2 flex-shrink-0">
            {connections.slice(0, 3).map((conn, idx) => {
              const orgName = conn.other_org_name;
              const logoUrl = conn.other_org_logo_url;
              const initials = orgName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <Avatar
                  key={conn.connection_id}
                  className="h-10 w-10 border-2 border-background"
                  style={{ zIndex: 3 - idx }}
                >
                  {logoUrl ? (
                    <AvatarImage src={logoUrl} alt={orgName} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
              Connect requests
            </div>
            <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {connections.length > 0 && (
                <>
                  {connections[0].other_org_slug || connections[0].other_org_name}
                  {pendingCount > 1 && ` + ${pendingCount - 1} others`}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge
            variant="destructive"
            className="h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs font-semibold"
          >
            {pendingCount}
          </Badge>
          <ChevronRight className="h-5 w-5" style={{ color: 'rgba(15,31,23,0.6)' }} />
        </div>
      </div>
    </Card>
  );
}
