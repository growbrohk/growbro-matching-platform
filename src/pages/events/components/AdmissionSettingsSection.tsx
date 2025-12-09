import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EventFormData, CHECK_IN_METHODS, CheckInMethod } from '@/lib/types/ticketing';

interface AdmissionSettingsSectionProps {
  data: EventFormData;
  onChange: (data: Partial<EventFormData>) => void;
}

export function AdmissionSettingsSection({ data, onChange }: AdmissionSettingsSectionProps) {
  const checkInMethod =
    data.admission_settings?.check_in_method || 'qr_scan_only';

  const handleCheckInMethodChange = (value: string) => {
    onChange({
      admission_settings: {
        ...data.admission_settings,
        check_in_method: value as CheckInMethod,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admission Settings / 入場設定</CardTitle>
        <CardDescription>Configure how attendees check in</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label>Check-in Method</Label>
          <RadioGroup value={checkInMethod} onValueChange={handleCheckInMethodChange}>
            {CHECK_IN_METHODS.map((method) => (
              <div key={method.value} className="flex items-center space-x-2">
                <RadioGroupItem value={method.value} id={method.value} />
                <Label htmlFor={method.value} className="font-normal cursor-pointer">
                  {method.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="redemption-notes">Redemption Notes / 入場說明</Label>
          <Textarea
            id="redemption-notes"
            value={data.admission_settings?.redemption_notes || ''}
            onChange={(e) =>
              onChange({
                admission_settings: {
                  ...data.admission_settings,
                  redemption_notes: e.target.value,
                },
              })
            }
            placeholder="e.g. 請於起點出示 QR code 以完成報到。"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}

