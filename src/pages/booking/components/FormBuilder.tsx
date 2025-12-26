import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { GripVertical, Loader2, Plus, Trash2, Edit } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface FormField {
  id: string;
  resource_id: string;
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  options: any;
  validation: any;
  sort_order: number;
  active: boolean;
}

interface FormBuilderProps {
  resourceId: string;
}

export default function FormBuilder({ resourceId }: FormBuilderProps) {
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    key: '',
    label: '',
    field_type: 'short_text',
    required: false,
    placeholder: '',
    help_text: '',
    options: '',
  });

  useEffect(() => {
    fetchFields();
  }, [resourceId]);

  const fetchFields = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_form_fields')
        .select('*')
        .eq('resource_id', resourceId)
        .order('sort_order');

      if (error) throw error;
      setFields(data || []);
    } catch (error: any) {
      console.error('Error fetching form fields:', error);
      toast.error('Failed to load form fields');
    } finally {
      setLoading(false);
    }
  };

  const generateKey = (label: string) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
  };

  const openDialog = (field?: FormField) => {
    if (field) {
      setEditingField(field);
      setFormData({
        key: field.key,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        placeholder: field.placeholder || '',
        help_text: field.help_text || '',
        options: field.options ? JSON.stringify(field.options, null, 2) : '',
      });
    } else {
      setEditingField(null);
      setFormData({
        key: '',
        label: '',
        field_type: 'short_text',
        required: false,
        placeholder: '',
        help_text: '',
        options: '',
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.label) {
      toast.error('Please enter a field label');
      return;
    }

    try {
      setSaving(true);
      const key = formData.key || generateKey(formData.label);
      
      let options = null;
      if (formData.options) {
        try {
          options = JSON.parse(formData.options);
        } catch (e) {
          toast.error('Invalid options JSON format');
          return;
        }
      }

      const fieldData = {
        resource_id: resourceId,
        key,
        label: formData.label,
        field_type: formData.field_type,
        required: formData.required,
        placeholder: formData.placeholder || null,
        help_text: formData.help_text || null,
        options,
        sort_order: editingField?.sort_order ?? fields.length,
        active: true,
      };

      if (editingField) {
        const { error } = await supabase
          .from('booking_form_fields')
          .update(fieldData)
          .eq('id', editingField.id);

        if (error) throw error;
        toast.success('Field updated successfully');
      } else {
        const { error } = await supabase
          .from('booking_form_fields')
          .insert(fieldData);

        if (error) throw error;
        toast.success('Field added successfully');
      }

      setShowDialog(false);
      fetchFields();
    } catch (error: any) {
      console.error('Error saving field:', error);
      toast.error(error.message || 'Failed to save field');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) return;

    try {
      const { error } = await supabase
        .from('booking_form_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
      toast.success('Field deleted successfully');
      fetchFields();
    } catch (error: any) {
      console.error('Error deleting field:', error);
      toast.error('Failed to delete field');
    }
  };

  const fieldTypeOptions = [
    { value: 'short_text', label: 'Short Text' },
    { value: 'long_text', label: 'Long Text' },
    { value: 'number', label: 'Number' },
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'date', label: 'Date' },
    { value: 'time', label: 'Time' },
  ];

  const needsOptions = ['dropdown', 'multiple_choice'].includes(formData.field_type);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Booking Form Fields</CardTitle>
              <CardDescription>
                Customize the form customers fill when making a reservation
              </CardDescription>
            </div>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No custom fields yet. Add fields to collect information from customers.</p>
              <p className="text-sm mt-2">
                Default fields (name, phone, email) are always included.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{field.label}</p>
                      {field.required && (
                        <span className="text-xs text-destructive">*required</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {field.field_type} · {field.key}
                    </p>
                    {field.help_text && (
                      <p className="text-xs text-muted-foreground mt-1">{field.help_text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={field.active} disabled />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog(field)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(field.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit Field' : 'Add Field'}</DialogTitle>
            <DialogDescription>
              Configure the form field properties
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Dietary Requirements"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key">Field Key</Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="Auto-generated from label"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this field (auto-generated if empty)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field_type">Field Type</Label>
              <Select
                value={formData.field_type}
                onValueChange={(value) => setFormData({ ...formData, field_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="required">Required Field</Label>
              <Switch
                id="required"
                checked={formData.required}
                onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="placeholder">Placeholder Text</Label>
              <Input
                id="placeholder"
                value={formData.placeholder}
                onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                placeholder="e.g., Enter your preferences..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="help_text">Help Text</Label>
              <Textarea
                id="help_text"
                value={formData.help_text}
                onChange={(e) => setFormData({ ...formData, help_text: e.target.value })}
                placeholder="Additional instructions for this field"
                rows={2}
              />
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <Label htmlFor="options">Options (JSON)</Label>
                <Textarea
                  id="options"
                  value={formData.options}
                  onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                  placeholder='[{"label": "Option 1", "value": "opt1"}, {"label": "Option 2", "value": "opt2"}]'
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  JSON array of objects with "label" and "value" properties
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.label}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Field'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

