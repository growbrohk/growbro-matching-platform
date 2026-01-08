import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutGrid, Image, Coffee, Calendar, Loader2 } from 'lucide-react';
import { useTypeDefinitions } from '@/hooks/use-type-definitions';
import type { TypeDefinition } from '@/lib/api/type-definitions';

export type SpaceCategory = 'poster_space' | 'consignment_shelf' | 'cup_sleeve_promotion' | 'event_hosting';

interface AddSpaceCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCategory: (category: SpaceCategory) => void;
}

// Fallback values for backward compatibility
const FALLBACK_SPACE_TYPES: TypeDefinition[] = [
  { id: '1', domain: 'space_type', value: 'consignment', label: 'Consignment', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['consignment_shelf', 'shelf', 'booth', 'counter'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '2', domain: 'space_type', value: 'promotion', label: 'Promotion', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space', 'cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
  { id: '3', domain: 'space_type', value: 'event', label: 'Event Hosting', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['event_hosting'], sort_order: 3, active: true, created_at: '', updated_at: '' },
];

// Icon mapping for space types
const getSpaceTypeIcon = (value: string) => {
  switch (value) {
    case 'consignment':
      return <LayoutGrid className="h-6 w-6" />;
    case 'promotion':
      return <Image className="h-6 w-6" />;
    case 'event':
      return <Calendar className="h-6 w-6" />;
    default:
      return <LayoutGrid className="h-6 w-6" />;
  }
};

// Description mapping for space types
const getSpaceTypeDescription = (value: string) => {
  switch (value) {
    case 'consignment':
      return 'Shelf space for consignment products';
    case 'promotion':
      return 'Display posters and promotional materials';
    case 'event':
      return 'Space for hosting events and gatherings';
    default:
      return 'Select a space type';
  }
};

// Map type definition to category (use first db_value)
const mapTypeToCategory = (typeDef: TypeDefinition): SpaceCategory => {
  if (typeDef.db_values.length > 0) {
    return typeDef.db_values[0] as SpaceCategory;
  }
  // Fallback
  return 'poster_space';
};

export default function AddSpaceCategoryModal({
  open,
  onOpenChange,
  onSelectCategory,
}: AddSpaceCategoryModalProps) {
  const { typeDefinitions, loading } = useTypeDefinitions({
    domain: 'space_type',
    fallback: FALLBACK_SPACE_TYPES,
  });

  const categoryOptions = useMemo(() => {
    return typeDefinitions.map((typeDef) => ({
      value: mapTypeToCategory(typeDef),
      label: typeDef.label,
      description: getSpaceTypeDescription(typeDef.value),
      icon: getSpaceTypeIcon(typeDef.value),
    }));
  }, [typeDefinitions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose Space Category</DialogTitle>
          <DialogDescription>
            Select the type of space you want to create
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading categories...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            {categoryOptions.map((option) => (
              <Card
                key={option.value}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary"
                onClick={() => {
                  onSelectCategory(option.value);
                  onOpenChange(false);
                }}
              >
                <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
                  <div className="text-primary">{option.icon}</div>
                  <h3 className="font-semibold text-lg" style={{ color: '#0F1F17' }}>
                    {option.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

