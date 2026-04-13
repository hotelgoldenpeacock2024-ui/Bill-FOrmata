-- Run this script in your Supabase SQL Editor to update the bookings table

ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS dsda_charge NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance_payment NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS guest_gst TEXT,
ADD COLUMN IF NOT EXISTS guest_address TEXT,
ADD COLUMN IF NOT EXISTS is_billed BOOLEAN DEFAULT false;
