-- Migration: Create lmb_transfers table and add inventory columns
-- Generated: 2026-08-21

-- Ensure pgcrypto is available for gen_random_uuid()
-- Transfers table to record inter-store stock movements
-- Add reserve stock and optional threshold to products if missing
-- Indexes for product stock columns (useful for queries)
-- Migration: create transfers table using unified column names and ensure product stock columns exist
-- Generated: 2026-08-21

-- Ensure gen_random_uuid() is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Création de la table de transferts si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.lmb_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_number TEXT,
    source_location TEXT NOT NULL,
    destination_location TEXT NOT NULL,
    items JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'PENDING',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lmb_transfers_source ON public.lmb_transfers(source_location);
CREATE INDEX IF NOT EXISTS idx_lmb_transfers_destination ON public.lmb_transfers(destination_location);
CREATE INDEX IF NOT EXISTS idx_lmb_transfers_status ON public.lmb_transfers(status);

-- Ajout des colonnes de stock sur lmb_products si elles n'existent pas
DO $$  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lmb_products' AND column_name='stock_dakar') THEN
        ALTER TABLE public.lmb_products ADD COLUMN stock_dakar INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lmb_products' AND column_name='stock_abidjan') THEN
        ALTER TABLE public.lmb_products ADD COLUMN stock_abidjan INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lmb_products' AND column_name='stock_reserve') THEN
        ALTER TABLE public.lmb_products ADD COLUMN stock_reserve INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lmb_products' AND column_name='stock_threshold') THEN
        ALTER TABLE public.lmb_products ADD COLUMN stock_threshold INT DEFAULT 5;
    END IF;
END $$;

-- Indexes pour accélérer les requêtes sur les colonnes de stock
CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_dakar ON public.lmb_products(stock_dakar);
CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_abidjan ON public.lmb_products(stock_abidjan);
CREATE INDEX IF NOT EXISTS idx_lmb_products_stock_reserve ON public.lmb_products(stock_reserve);
