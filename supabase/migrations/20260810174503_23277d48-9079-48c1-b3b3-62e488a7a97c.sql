CREATE TABLE public.pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  address text,
  phone text,
  hours text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pharmacies TO anon, authenticated;
GRANT ALL ON public.pharmacies TO service_role;
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pharmacy details are public" ON public.pharmacies FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  pin_hash text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_users TO service_role;
ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_phone_idx ON public.otp_challenges (phone, created_at DESC);
GRANT ALL ON public.otp_challenges TO service_role;
ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_sessions TO service_role;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  file_path text,
  file_type text,
  source text NOT NULL DEFAULT 'upload',
  patient_name text,
  doctor_name text,
  prescription_date text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prescriptions_user_idx ON public.prescriptions (user_id, created_at DESC);
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  name text NOT NULL,
  strength text,
  form text,
  dosage text,
  duration text,
  quantity text,
  instructions text,
  confidence text,
  position int NOT NULL DEFAULT 0
);
CREATE INDEX prescription_items_rx_idx ON public.prescription_items (prescription_id);
GRANT ALL ON public.prescription_items TO service_role;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

INSERT INTO public.pharmacies (code, name, tagline, address, phone, hours) VALUES
('sunrise', 'Sunrise Pharmacy', 'Your neighbourhood chemist since 1998', '12 MG Road, Indiranagar, Bengaluru 560038', '+91 98765 43210', 'Open daily 8:00 AM - 11:00 PM'),
('citycare', 'CityCare Chemists', 'Prescriptions filled with care', '44 Anna Salai, Chennai 600002', '+91 91234 56780', 'Mon-Sat 9:00 AM - 10:00 PM');