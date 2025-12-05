-- Fix function search paths for security
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_like = true THEN
    IF EXISTS (
      SELECT 1 FROM public.likes 
      WHERE from_user_id = NEW.to_user_id 
      AND to_user_id = NEW.from_user_id 
      AND is_like = true
    ) THEN
      INSERT INTO public.matches (user_one_id, user_two_id)
      VALUES (
        LEAST(NEW.from_user_id, NEW.to_user_id),
        GREATEST(NEW.from_user_id, NEW.to_user_id)
      )
      ON CONFLICT (user_one_id, user_two_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;