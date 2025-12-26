import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface BookingSettings {
  org_id: string;
  timezone: string;
  allow_manual_payment: boolean;
  allow_stripe: boolean;
  manual_payment_instructions: string | null;
  manual_payment_qr_url: string | null;
}

export default function BookingV2Settings() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BookingSettings | null>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      fetchSettings();
    }
  }, [currentOrg?.id]);

  const fetchSettings = async () => {
    if (!currentOrg?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_settings')
        .select('*')
        .eq('org_id', currentOrg.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Initialize default settings
        setSettings({
          org_id: currentOrg.id,
          timezone: 'Asia/Hong_Kong',
          allow_manual_payment: true,
          allow_stripe: false,
          manual_payment_instructions: null,
          manual_payment_qr_url: null,
        });
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentOrg?.id || !settings) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('booking_settings')
        .upsert({
          ...settings,
          org_id: currentOrg.id,
        });

      if (error) throw error;

      toast.success('Settings saved successfully');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Booking Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure global settings for your booking system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Basic configuration for bookings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              placeholder="Asia/Hong_Kong"
            />
            <p className="text-sm text-muted-foreground">
              Default timezone for all booking resources
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Configure available payment options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="manual-payment">Manual Payment</Label>
              <p className="text-sm text-muted-foreground">
                Allow customers to submit payment proof manually (bank transfer, etc.)
              </p>
            </div>
            <Switch
              id="manual-payment"
              checked={settings.allow_manual_payment}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, allow_manual_payment: checked })
              }
            />
          </div>

          {settings.allow_manual_payment && (
            <div className="space-y-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-2">
                <Label htmlFor="payment-instructions">Payment Instructions</Label>
                <Textarea
                  id="payment-instructions"
                  value={settings.manual_payment_instructions || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, manual_payment_instructions: e.target.value })
                  }
                  placeholder="e.g., Please transfer to Bank Account: 123-456-789"
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Instructions shown to customers on how to make manual payment
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-qr">Payment QR Code URL</Label>
                <Input
                  id="payment-qr"
                  value={settings.manual_payment_qr_url || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, manual_payment_qr_url: e.target.value })
                  }
                  placeholder="https://example.com/qr-code.png"
                />
                <p className="text-sm text-muted-foreground">
                  URL to a QR code image for payment (FPS, PayMe, etc.)
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="stripe-payment">Stripe Payment</Label>
              <p className="text-sm text-muted-foreground">
                Accept online payments via Stripe (coming soon)
              </p>
            </div>
            <Switch
              id="stripe-payment"
              checked={settings.allow_stripe}
              onCheckedChange={(checked) => setSettings({ ...settings, allow_stripe: checked })}
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchSettings} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

