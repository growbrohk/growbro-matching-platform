import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useConnectedOrgs, type ConnectedOrg } from '@/hooks/use-connected-orgs';
import { usePendingConnectionsCount } from '@/hooks/use-pending-connections-count';
import ConnectRequestsPreviewCard from '@/components/connections/ConnectRequestsPreviewCard';
import { Loader2 } from 'lucide-react';

export default function OrgConnectionsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Use provided orgId from route param, fallback to currentOrg
  // IMPORTANT: Always use route param if available to ensure correct org context
  const targetOrgId = orgId || currentOrg?.id;

  const { data: connectedOrgs = [], isLoading: isLoadingConnected, error: connectedOrgsError } = useConnectedOrgs(targetOrgId);
  
  // Temporary log to verify RPC output shape
  if (connectedOrgs && connectedOrgs.length > 0) {
    console.log('get_connected_orgs keys', Object.keys(connectedOrgs[0]));
  }
  
  // Log error for debugging if RPC fails (e.g., user not member of org)
  if (connectedOrgsError) {
    console.warn('Error loading connected orgs:', connectedOrgsError);
  }
  const { data: pendingData } = usePendingConnectionsCount();

  // Group connected orgs by category
  const orgsByCategory = useMemo(() => {
    const grouped = new Map<string, ConnectedOrg[]>();
    
    connectedOrgs.forEach((org) => {
      const category = org.category || 'Other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(org);
    });

    return grouped;
  }, [connectedOrgs]);

  // Filter orgs by search query and category
  const filteredOrgs = useMemo(() => {
    let filtered = connectedOrgs;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((org) => (org.category || 'Other') === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (org) =>
          org.name.toLowerCase().includes(query) ||
          org.handle.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [connectedOrgs, selectedCategory, searchQuery]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const categories = Array.from(orgsByCategory.keys()).sort();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="h-10 w-10 rounded-full"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Connect
        </h1>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(15,31,23,0.5)' }} />
        <Input
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-2xl"
          style={{
            borderColor: 'rgba(14,122,58,0.14)',
            backgroundColor: '#FBF8F4',
            color: '#0F1F17',
          }}
        />
      </div>

      {/* Connect Requests Section */}
      {pendingData && pendingData.count > 0 && (
        <div>
          <ConnectRequestsPreviewCard
            pendingCount={pendingData.count}
            connections={pendingData.connections}
            onClick={() => navigate('/app/enquiries/connect-requests')}
          />
        </div>
      )}

      {/* Categories Section */}
      {categories.length > 0 && !selectedCategory && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
            Categories
          </h2>
          <div className="space-y-2">
            {categories.map((category) => {
              const orgsInCategory = orgsByCategory.get(category) || [];
              const firstOrg = orgsInCategory[0];
              const count = orgsInCategory.length;

              return (
                <Card
                  key={category}
                  className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow"
                  style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                  onClick={() => setSelectedCategory(category)}
                >
                  <div className="flex items-center gap-3">
                    {firstOrg && (
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        {firstOrg.avatar_url ? (
                          <AvatarImage src={firstOrg.avatar_url} alt={firstOrg.name} />
                        ) : null}
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          {getInitials(firstOrg.name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
                        {category}
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                        {count === 1
                          ? `${firstOrg?.name || '1 account'}`
                          : `${firstOrg?.name || '1 account'} and ${count - 1} others`}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All Connected Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
            {selectedCategory ? `${selectedCategory}` : 'All connected'}
          </h2>
          {selectedCategory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="text-xs"
            >
              Clear filter
            </Button>
          )}
        </div>

        {isLoadingConnected ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#0E7A3A' }} />
          </div>
        ) : !isLoadingConnected && filteredOrgs.length === 0 ? (
          <Card className="rounded-2xl border p-8 text-center" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
            <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              {searchQuery
                ? 'No connected orgs match your search'
                : selectedCategory
                ? `No connected orgs in ${selectedCategory}`
                : 'No connected orgs yet'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredOrgs.map((org) => (
              <Card
                key={org.org_id}
                className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow"
                style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                onClick={() => navigate(`/profile/${org.handle}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      {org.avatar_url ? (
                        <AvatarImage src={org.avatar_url} alt={org.name} />
                      ) : null}
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {getInitials(org.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: '#0F1F17' }}>
                        {org.name}
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                        {org.handle}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-4 rounded-lg"
                    style={{ backgroundColor: 'rgba(15,31,23,0.1)', color: '#0F1F17' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/messages/new?toOrg=${org.org_id}`);
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
