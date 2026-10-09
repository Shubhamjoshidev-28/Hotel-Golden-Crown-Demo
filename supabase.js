/* Config + client. Fill the two values from Supabase > Project Settings > API. */
const SUPABASE_URL = 'https://fqgbhfsaxivwuodyrdst.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lj-F8uvt7Z44qr-rOKF_sw_Bbipot_2';
const HOTEL_NAME = 'Hotel Golden Crown';
const BUCKET_ROOMS = 'room-images', BUCKET_IDS = 'guest-ids';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const emailFor = u => `${u.trim().toLowerCase()}@hotel.local`; // username -> auth email
