import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
    <div className="max-w-3xl space-y-6 md:space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Settings
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Manage your organization settings
          </p>
        </div>

        <Card className="rounded-3xl border shadow-xl hover:shadow-2xl transition-shadow" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                  <Tags className="h-5 w-5" />
                  Catalog Settings
                </CardTitle>
                <CardDescription className="mt-1">
                  Manage categories and tags for your products
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <Link to="/app/settings/catalog">
              <Button variant="outline" className="w-full sm:w-auto">
                Manage Categories & Tags
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              Organization Profile
            </CardTitle>
            <CardDescription>
              Update your organization's basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-6 pt-0">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-10"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Organization Type</Label>
              <div className="px-3 py-2.5 rounded-lg text-sm" style={{ backgroundColor: 'rgba(14,122,58,0.08)', color: 'rgba(15,31,23,0.75)' }}>
                {orgType === 'brand' ? 'Brand' : orgType === 'venue' ? 'Venue' : 'Not set'}
              </div>
              <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Organization type cannot be changed
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || !orgName.trim() || orgName === currentOrg.name}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                className="w-full sm:w-auto"
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

