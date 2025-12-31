import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Time24Picker } from '@/components/ui/Time24Picker';
import React from 'react';

interface Field {
  id: string;
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder?: string | null;
  help_text?: string | null;
  options?: any;
  validation?: any;
}

interface Props {
  fields: Field[];
  mode: 'preview' | 'public';
}

export default function BookingFormRenderer({ fields, mode }: Props) {
  // Preview mode: all fields are disabled, no onChange/setState

  return (
    <form className="space-y-6">
      {fields.map(field => (
        <FieldRenderer key={field.id} field={field} />
      ))}
      <Button type="button" className="w-full" disabled>
        Preview Mode — Submission Disabled
      </Button>
    </form>
  );
}

function FieldRenderer({ field }: { field: Field }) {
  const { field_type, label, required, placeholder, help_text, options, validation } = field;
  const baseProps = {
    placeholder: placeholder || '',
    required,
    disabled: true,
    className: 'w-full',
    min: validation?.min,
    max: validation?.max,
    pattern: validation?.pattern,
  };
  return (
    <div className="space-y-1">
      <Label className="font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <FieldInput field={field} baseProps={baseProps} />
      {help_text && (
        <div className="text-xs text-muted-foreground pt-0.5">{help_text}</div>
      )}
      {validation && (validation.min || validation.max) && (
        <div className="text-xs text-gray-400 pb-0.5">
          {validation.min != null && `Min: ${validation.min} `}
          {validation.max != null && `Max: ${validation.max}`}
        </div>
      )}
    </div>
  );
}

function FieldInput({ field, baseProps }: { field: Field; baseProps: any }) {
  switch (field.field_type) {
    case 'short_text':
      return <Input {...baseProps} />;
    case 'long_text':
      return <Textarea {...baseProps} />;
    case 'number':
      return <Input type="number" {...baseProps} />;
    case 'email':
      return <Input type="email" {...baseProps} />;
    case 'phone':
      return <Input type="tel" {...baseProps} />;
    case 'date':
      return <Input type="date" {...baseProps} />;
    case 'time':
      return <Time24Picker value={baseProps.value || "00:00"} onChange={() => {}} disabled={true} className={baseProps.className} id={baseProps.id} />;
    case 'dropdown':
    case 'multiple_choice':
      return (
        <Select disabled defaultValue="">
          <option value="" disabled>Select…</option>
          {Array.isArray(field.options)
            ? field.options.map((opt, i) => <option value={opt.value || opt} key={i}>{opt.label || opt}</option>)
            : null}
        </Select>
      );
    case 'checkbox':
      return <Checkbox disabled />;
    default:
      return <Input {...baseProps} />;
  }
}

