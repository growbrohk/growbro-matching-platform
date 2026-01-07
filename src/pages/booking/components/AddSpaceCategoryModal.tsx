import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutGrid, Image, Coffee, Calendar } from 'lucide-react';

export type SpaceCategory = 'poster_space' | 'consignment_shelf' | 'cup_sleeve_promotion' | 'event_hosting';

interface AddSpaceCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCategory: (category: SpaceCategory) => void;
}

const categoryOptions: Array<{
  value: SpaceCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'poster_space',
    label: 'Poster Space',
    description: 'Display posters and artwork',
    icon: <Image className="h-6 w-6" />,
  },
  {
    value: 'consignment_shelf',
    label: 'Consignment Shelf',
    description: 'Shelf space for consignment products',
    icon: <LayoutGrid className="h-6 w-6" />,
  },
  {
    value: 'cup_sleeve_promotion',
    label: 'Cup Sleeve Promotion',
    description: 'Promotional space on cup sleeves',
    icon: <Coffee className="h-6 w-6" />,
  },
  {
    value: 'event_hosting',
    label: 'Event Hosting',
    description: 'Space for hosting events and gatherings',
    icon: <Calendar className="h-6 w-6" />,
  },
];

export default function AddSpaceCategoryModal({
  open,
  onOpenChange,
  onSelectCategory,
}: AddSpaceCategoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose Space Category</DialogTitle>
          <DialogDescription>
            Select the type of space you want to create
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}

