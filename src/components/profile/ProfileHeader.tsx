import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Link2 } from 'lucide-react';

export interface ProfileHeaderProps {
  org: {
    id: string;
    name: string;
    slug?: string | null;
  };
  profile?: {
    instagram: string | null;
    address: string;
    bio: string | null;
    website: string | null;
    logo_url: string | null;
  } | null;
  stats: {
    catalogCount: number;
    collabsCount: number;
    connectCount: number;
  };
  mode: 'owner' | 'public';
  onConnectClick?: () => void;
  connectedCount?: number; // Optional override for connectCount from hook
  onConnectStatClick?: () => void; // Optional handler for clicking Connect stat
}

export default function ProfileHeader({ org, profile, stats, mode, onConnectClick, connectedCount, onConnectStatClick }: ProfileHeaderProps) {
  const brandName = org.name || 'Untitled';
  
  // Format Instagram handle - extract username from URL if needed
  const instagramHandle = profile?.instagram 
    ? (() => {
        let handle = profile.instagram.trim();
        // Extract username from URL if it's a full URL
        if (handle.includes('instagram.com/')) {
          const match = handle.match(/instagram\.com\/([^\/\?]+)/);
          handle = match ? match[1] : handle;
        }
        // Remove @ if present, then add it back
        handle = handle.replace(/^@/, '');
        return `@${handle}`;
      })()
    : null;
  
  const address = profile?.address || '';
  const bio = profile?.bio || '';
  const website = profile?.website || '';
  const logoUrl = profile?.logo_url || '';

  // Format bio with line breaks
  const bioLines = bio.split('\n').filter(line => line.trim());

  return (
    <div className="w-full">
      {/* Profile Header */}
      <div className="flex gap-6 md:gap-8 mb-4">
        {/* Profile Picture */}
        <div className="flex-shrink-0">
          <Avatar 
            className="h-20 w-20 md:h-24 md:w-24 border-2 shadow-sm" 
            style={{ 
              borderColor: 'rgba(14,122,58,0.2)',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={brandName} />
            ) : (
              <AvatarFallback className="text-2xl md:text-3xl font-bold" style={{ backgroundColor: 'rgba(14,122,58,0.1)', color: '#0E7A3A' }}>
                {brandName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Brand Name, Handle, Address */}
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <h1 className="text-xl md:text-2xl font-bold inline" style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}>
              {brandName}
            </h1>
            {instagramHandle && (
              <span className="text-base md:text-lg font-normal ml-2" style={{ color: 'rgba(15,31,23,0.6)' }}>
                {instagramHandle}
              </span>
            )}
          </div>
          {address && (
            <p className="text-sm md:text-base mb-0" style={{ color: '#0F1F17' }}>
              {address}
            </p>
          )}
        </div>
      </div>

      {/* Stats Row with Dividers */}
      <div className="flex justify-between items-center py-3 border-t border-b mb-4" style={{ borderColor: 'rgba(0, 0, 0, 0.1)' }}>
        <div className="flex items-baseline gap-1">
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {stats.catalogCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Catalog
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {stats.collabsCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Collabs
          </span>
        </div>
        <div 
          className={`flex items-baseline gap-1 ${onConnectStatClick ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
          onClick={onConnectStatClick}
        >
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {connectedCount !== undefined ? connectedCount : stats.connectCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Connect
          </span>
        </div>
      </div>

      {/* Bio Section */}
      {bioLines.length > 0 && (
        <div className="mb-4">
          {bioLines.map((line, index) => (
            <p 
              key={index} 
              className="text-sm md:text-base mb-1 leading-relaxed" 
              style={{ color: '#0F1F17', lineHeight: '1.6' }}
            >
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Website/Link */}
      {website && (
        <div className="mb-6">
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm md:text-base font-medium hover:underline"
            style={{ color: '#2563eb' }}
          >
            <Link2 className="h-4 w-4" />
            {website.replace(/^https?:\/\//, '').replace(/^www\./, '')}
          </a>
        </div>
      )}
    </div>
  );
}

