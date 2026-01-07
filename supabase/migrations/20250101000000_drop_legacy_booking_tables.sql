-- =====================================================
-- Drop Legacy Booking V2 System Tables
-- =====================================================
-- This migration removes the legacy booking_resources system
-- in favor of the new poster_spaces system.
-- 
-- Removed tables:
-- - booking_checkins
-- - booking_payment_intents
-- - booking_reservations
-- - booking_form_fields
-- - booking_slots
-- - booking_availability_rules
-- - booking_resources
-- - booking_settings
--
-- Removed types:
-- - booking_field_type
-- - booking_payment_status
-- - booking_payment_mode
-- - booking_reservation_status
-- - booking_slot_status
-- - booking_rule_type
-- - booking_resource_type
-- =====================================================

-- Drop tables in reverse dependency order (children first)
DROP TABLE IF EXISTS booking_checkins CASCADE;
DROP TABLE IF EXISTS booking_payment_intents CASCADE;
DROP TABLE IF EXISTS booking_reservations CASCADE;
DROP TABLE IF EXISTS booking_form_fields CASCADE;
DROP TABLE IF EXISTS booking_slots CASCADE;
DROP TABLE IF EXISTS booking_availability_rules CASCADE;
DROP TABLE IF EXISTS booking_resources CASCADE;
DROP TABLE IF EXISTS booking_settings CASCADE;

-- Drop RLS policies (they are automatically dropped with tables, but explicit for clarity)
-- Note: Policies are automatically dropped with CASCADE, but documenting here

-- Drop types/enums
DROP TYPE IF EXISTS booking_field_type CASCADE;
DROP TYPE IF EXISTS booking_payment_status CASCADE;
DROP TYPE IF EXISTS booking_payment_mode CASCADE;
DROP TYPE IF EXISTS booking_reservation_status CASCADE;
DROP TYPE IF EXISTS booking_slot_status CASCADE;
DROP TYPE IF EXISTS booking_rule_type CASCADE;
DROP TYPE IF EXISTS booking_resource_type CASCADE;

-- Drop RPC functions related to legacy booking system
DROP FUNCTION IF EXISTS public_booking_get_context CASCADE;
DROP FUNCTION IF EXISTS public_booking_create_reservation CASCADE;
DROP FUNCTION IF EXISTS public_booking_submit_proof CASCADE;
DROP FUNCTION IF EXISTS public_booking_get_reservation CASCADE;
DROP FUNCTION IF EXISTS host_booking_mark_paid CASCADE;
DROP FUNCTION IF EXISTS host_booking_checkin_by_token CASCADE;
DROP FUNCTION IF EXISTS booking_expire_pending CASCADE;

