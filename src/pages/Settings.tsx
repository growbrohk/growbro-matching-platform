import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { currentOrg, refreshOrgMemberships } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentOrg) {
      setOrgName(currentOrg.name);
    }
  }, [currentOrg]);

  const handleSave = async () => {
    if (!currentOrg || !orgName.trim()) {
      toast.error('Organization name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('orgs')
        .update({ name: orgName.trim() })
        .eq('id', currentOrg.id);

      if (error) throw error;

      await refreshOrgMemberships();
      toast.success('Organization settings updated');
    } catch (error: any) {
      console.error('Error updating org:', error);
      toast.error(error.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const orgType = (currentOrg.metadata as any)?.org_type || 'unknown';

  return (
    <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Settings
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Manage your organization settings
          </p>
        </div>

        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader>
            <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              Organization Profile
            </CardTitle>
            <CardDescription>
              Update your organization's basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="mt-1"
                disabled={saving}
              />
            </div>

            <div>
              <Label>Organization Type</Label>
              <div className="mt-1 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(14,122,58,0.08)', color: 'rgba(15,31,23,0.75)' }}>
                {orgType === 'brand' ? 'Brand' : orgType === 'venue' ? 'Venue' : 'Not set'}
              </div>
              <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Organization type cannot be changed
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || !orgName.trim() || orgName === currentOrg.name}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}

