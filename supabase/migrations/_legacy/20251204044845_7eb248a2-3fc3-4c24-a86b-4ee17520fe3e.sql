-- Create enum for venue collab option types
CREATE TYPE public.venue_option_type AS ENUM ('event_slot', 'shelf_space', 'exhibition_period', 'wall_space', 'other');

-- Create venue_collab_options table
CREATE TABLE public.venue_collab_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type venue_option_type NOT NULL,
  short_description TEXT,
  full_description TEXT,
  collab_types collab_type[] DEFAULT '{}'::collab_type[],
  available_from TIMESTAMP WITH TIME ZONE,
  available_to TIMESTAMP WITH TIME ZONE,
  recurring_pattern TEXT,
  capacity_note TEXT,
  location_note TEXT,
  pricing_note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create collab_request_venue_options junction table
CREATE TABLE public.collab_request_venue_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collab_request_id UUID NOT NULL,
  venue_collab_option_id UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_collab_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_request_venue_options ENABLE ROW LEVEL SECURITY;

-- RLS policies for venue_collab_options
CREATE POLICY "Venue options are viewable by everyone"
ON public.venue_collab_options
FOR SELECT
USING (true);

CREATE POLICY "Venues can insert their own options"
ON public.venue_collab_options
FOR INSERT
WITH CHECK (auth.uid() = venue_user_id);

CREATE POLICY "Venues can update their own options"
ON public.venue_collab_options
FOR UPDATE
USING (auth.uid() = venue_user_id);

CREATE POLICY "Venues can delete their own options"
ON public.venue_collab_options
FOR DELETE
USING (auth.uid() = venue_user_id);

-- RLS policies for collab_request_venue_options
CREATE POLICY "Users can view venue options in their collab requests"
ON public.collab_request_venue_options
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM collab_requests cr
  WHERE cr.id = collab_request_venue_options.collab_request_id
  AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
));

CREATE POLICY "Users can insert venue options to their collab requests"
ON public.collab_request_venue_options
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM collab_requests cr
  WHERE cr.id = collab_request_venue_options.collab_request_id
  AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
));

CREATE POLICY "Users can delete venue options from their collab requests"
ON public.collab_request_venue_options
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM collab_requests cr
  WHERE cr.id = collab_request_venue_options.collab_request_id
  AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
));

-- Add trigger for updated_at
CREATE TRIGGER update_venue_collab_options_updated_at
BEFORE UPDATE ON public.venue_collab_options
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();