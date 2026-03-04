-- AutoArbitrage Database Schema

-- 1. `vehicles` (Target Models & Baselines)
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    baseline_fuel_mileage FLOAT NOT NULL,
    baseline_depreciation FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. `listings` (The Live Market Data)
CREATE TYPE listing_status AS ENUM ('ACTIVE', 'SOLD', 'DELISTED');

CREATE TABLE public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    source_url TEXT UNIQUE NOT NULL,
    currency TEXT DEFAULT 'SGD' NOT NULL,
    vehicle_year INT,
    registration_date DATE,
    discovery_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_price DECIMAL NOT NULL,
    mileage_km INT,
    dealer_description TEXT,
    remaining_lease DECIMAL,
    deal_score INT CHECK (deal_score >= 0 AND deal_score <= 100),
    status listing_status DEFAULT 'ACTIVE' NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. `price_history` (The Delta Tracker)
CREATE TABLE public.price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
    price DECIMAL NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. `alerts_log` (Audit Trail)
CREATE TABLE public.alerts_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
    telegram_message_id TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_listings_vehicle_id ON public.listings(vehicle_id);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_price_history_listing_id ON public.price_history(listing_id);

-- Enable Row Level Security
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_log ENABLE ROW LEVEL SECURITY;

-- Create Policies (Read-Only for unauthenticated/anonymous users, full access for authenticated/admin)
-- Change this as needed for your specific authentication setup. 
-- For the dashboard, we want anyone to be able to read listings and vehicles.
CREATE POLICY "Enable read access for all users" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.listings FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.price_history FOR SELECT USING (true);

-- API/Service Role will bypass RLS, so the cron job will still work to insert data.
-- If you want authenticated users to modify, you'd add:
-- CREATE POLICY "Enable insert for authenticated users only" ON public.listings FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Enable update for authenticated users only" ON public.listings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Insert Target Vehicles Seed Data
INSERT INTO public.vehicles (make, model, baseline_fuel_mileage, baseline_depreciation) VALUES
('Mitsubishi', 'Outlander', 13.5, 17500),
('Toyota', 'Noah Hybrid', 23.5, 18500),
('Nissan', 'Serena', 20.2, 19000),
('Honda', 'Stepwgn Hybrid Spada', 19.5, 19500);
 
-- 5. `upsert_listing` RPC Function
CREATE OR REPLACE FUNCTION public.upsert_listing(
    p_vehicle_id UUID,
    p_source_url TEXT,
    p_current_price DECIMAL,
    p_vehicle_year INT,
    p_registration_date DATE,
    p_mileage_km INT,
    p_remaining_lease DECIMAL,
    p_dealer_description TEXT,
    p_deal_score INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_listing_id UUID;
    v_old_price DECIMAL;
    v_is_new BOOLEAN := FALSE;
    v_price_dropped BOOLEAN := FALSE;
BEGIN
    -- 1. Try to find existing listing
    SELECT id, current_price INTO v_listing_id, v_old_price
    FROM public.listings
    WHERE source_url = p_source_url;

    IF v_listing_id IS NULL THEN
        -- 2. Insert new listing
        INSERT INTO public.listings (
            vehicle_id, 
            source_url, 
            current_price, 
            vehicle_year,
            registration_date,
            mileage_km, 
            remaining_lease, 
            dealer_description, 
            deal_score,
            status
        )
        VALUES (
            p_vehicle_id, 
            p_source_url, 
            p_current_price, 
            p_vehicle_year,
            p_registration_date,
            p_mileage_km, 
            p_remaining_lease, 
            p_dealer_description, 
            p_deal_score,
            'ACTIVE'
        )
        RETURNING id INTO v_listing_id;

        v_is_new := TRUE;

        -- Record initial price in history
        INSERT INTO public.price_history (listing_id, price)
        VALUES (v_listing_id, p_current_price);
    ELSE
        -- 3. Update existing listing
        UPDATE public.listings
        SET 
            current_price = p_current_price,
            mileage_km = p_mileage_km,
            registration_date = p_registration_date,
            dealer_description = p_dealer_description,
            remaining_lease = p_remaining_lease,
            deal_score = p_deal_score,
            updated_at = now(),
            status = 'ACTIVE' -- Reactivate if it was delisted/sold (though URL is unique)
        WHERE id = v_listing_id;

        -- Check for price drop
        IF p_current_price < v_old_price THEN
            v_price_dropped := TRUE;
            
            -- Record new price in history
            INSERT INTO public.price_history (listing_id, price)
            VALUES (v_listing_id, p_current_price);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'listingId', v_listing_id,
        'isNewOrDropped', (v_is_new OR v_price_dropped)
    );
END;
$$;

