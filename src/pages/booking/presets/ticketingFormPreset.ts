export type BookingFormFieldPreset = {
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
};

export const TICKETING_EVENT_FORM_PRESET_FIELDS: BookingFormFieldPreset[] = [
  {
    key: 'quantity',
    label: 'Number of Tickets',
    field_type: 'number',
    required: true,
    placeholder: '1',
    help_text: 'How many spots are you booking?',
    options: null,
    validation: {
      min: 1,
      max: 4,
    },
    sort_order: 10,
    active: true,
  },
  {
    key: 'attendee_names',
    label: 'Attendee Name(s)',
    field_type: 'long_text',
    required: false,
    placeholder: 'e.g. Eddie, Cherie, Alan',
    help_text: 'If booking for friends, list their names (optional).',
    options: null,
    validation: null,
    sort_order: 20,
    active: true,
  },
  {
    key: 'notes',
    label: 'Notes / Special Requests',
    field_type: 'long_text',
    required: false,
    placeholder: 'Anything we should know?',
    help_text: 'Optional.',
    options: null,
    validation: null,
    sort_order: 30,
    active: true,
  },
];


