-- Seed: elonmusk demo profile
-- Run in the Supabase SQL editor against whichever environment you want
-- the profile to appear in (local / staging / prod).
-- Idempotent: re-running updates the profile rather than duplicating it.

DO $$
DECLARE
  user_uuid UUID := '7e10d5ad-1971-4c12-b150-e10a07112002'::uuid;
  user_email TEXT := 'elonmusk+demo@makerly.me';
BEGIN
  -- 1. auth.users row (FK target for profiles.id)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    user_uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    user_email,
    crypt('demo-elon-' || gen_random_uuid()::text, gen_salt('bf')),
    now(),
    jsonb_build_object('username', 'elonmusk'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 2. Profile (upsert — handle_new_user trigger may have created an id+username row)
INSERT INTO profiles (
  id,
  username,
  name,
  bio,
  philosophy,
  first_make_description,
  first_make_age,
  today_making,
  domains,
  socials,
  embed_feed,
  show_email,
  contact_email,
  cracked_squad,
  press_links,
  total_raised,
  total_valuation,
  total_users
)
VALUES (
  '7e10d5ad-1971-4c12-b150-e10a07112002'::uuid,
  'elonmusk',
  'Elon Musk',
  E'I make things that move atoms.\n' ||
  E'Started door-to-door in Pretoria with chocolate Easter eggs and homemade gunpowder rockets.\n' ||
  E'Now: cars, rockets, tunnels, satellites, neural implants, humanoid robots. Same algorithm, larger blast radius.',
  'Reason from physics, not by analogy. Question every requirement — then delete the part.',
  E'Three things, in order. (1) Around age 9–10 in Pretoria, my brother Kimbal, our cousins and I made chocolate Easter eggs in our kitchen and sold them door-to-door in the wealthy suburbs at brutal markups. (2) At 12 we signed a real lease for an arcade near our high school — the city killed it because none of us were old enough to hold a real estate permit. (3) Same year, 1984, I wrote Blastar — 123 lines of BASIC plus a little assembly to make the graphics work. It ran on a Spectravideo 328, not an IBM PC, which is why almost no one ever played it. PC and Office Technology paid me ~$500 to print the listing on page 69, byline ''E. R. Musk''.',
  '10',
  E'Starship → Mars (SpaceX). Optimus + FSD (Tesla). Grok and the Colossus training cluster (xAI). Whole-brain interfaces (Neuralink). Tunnels (Boring Company). And X — the platform I tried to build under that name in 1999 before the board fired me for it.',
  ARRAY['space', 'transportation', 'energy', 'robotics', 'ai', 'neurotech', 'fintech', 'social', 'tunneling'],
  jsonb_build_object(
    'twitter',  'https://x.com/elonmusk',
    'github',   '',
    'linkedin', '',
    'substack', '',
    'website',  'https://x.ai'
  ),
  jsonb_build_object('type', 'twitter', 'url', '@elonmusk'),
  FALSE,
  '',
  TRUE,
  '[
    {
      "url": "https://blastar-1984.appspot.com/",
      "source": "Blastar (1984)",
      "title": "Playable HTML5 port of my first commercial product — shoot down hydrogen-bomb-throwing aliens"
    },
    {
      "url": "http://jimgerrie.blogspot.com/2021/07/elon-musks-early-type-in-game-blastar.html",
      "source": "Type-in Mania",
      "title": "The original Blastar BASIC listing as printed in PC and Office Technology, 1984"
    },
    {
      "url": "https://en.wikipedia.org/wiki/Zip2",
      "source": "Zip2",
      "title": "Originally incorporated as Global Link Information Network — $2K from me, $5K from Kimbal, $8K from co-founder Greg Kouri"
    },
    {
      "url": "https://en.wikipedia.org/wiki/X.com_(bank)",
      "source": "X.com (bank)",
      "title": "X.com 1999 — checking accounts, mutual funds via Barclays, S&P-tracking funds. A real bank."
    },
    {
      "url": "https://knowledge.wharton.upenn.edu/article/harnessing-the-sun-and-outer-space-elon-musks-sky-high-vision/",
      "source": "Knowledge@Wharton",
      "title": "My three Penn business-plan papers (1994–95): orbital solar power, world-information database, ultracapacitor EVs — i.e. SolarCity, the internet, Tesla"
    },
    {
      "url": "https://www.fastcompany.com/3006829/spacex-founder-elon-musk-considered-buying-russian-ballistic-missiles-nukes",
      "source": "Fast Company",
      "title": "October 2001 + February 2002: I went to Moscow twice to buy refurbished ICBMs. They laughed at me. SpaceX is the backup plan."
    },
    {
      "url": "https://www.vice.com/en/article/spacex-is-because-elon-musk-wanted-to-grow-plants-on-mars/",
      "source": "Mars Oasis",
      "title": "The original SpaceX wasn''t a rocket company — it was a robotic greenhouse to grow a plant in Martian soil and broadcast the picture home"
    },
    {
      "url": "https://fortune.com/longform/book-excerpt-paypal-founders-elon-musk-max-levchin/",
      "source": "Fortune (PayPal Wars excerpt)",
      "title": "Cold-called Peter Nicholson at the Bank of Nova Scotia after reading a magazine article about him — got the internship on the spot"
    },
    {
      "url": "https://www.simonandschuster.com/books/Elon-Musk/Walter-Isaacson/9781982181284",
      "source": "Simon & Schuster",
      "title": "Isaacson''s 670-page biography (2023) — the definitive long-form"
    }
  ]'::jsonb,
  3000000000000,    -- $30B in cents (cumulative private raises across SpaceX, Tesla early, xAI, Neuralink, Boring Co.)
  150000000000000,  -- $1.5T in cents (Tesla + SpaceX + xAI combined enterprise value)
  600000000         -- ~600M (X MAU, Tesla fleet, Starlink subs combined order of magnitude)
)
ON CONFLICT (id) DO UPDATE SET
  username                = EXCLUDED.username,
  name                    = EXCLUDED.name,
  bio                     = EXCLUDED.bio,
  philosophy              = EXCLUDED.philosophy,
  first_make_description  = EXCLUDED.first_make_description,
  first_make_age          = EXCLUDED.first_make_age,
  today_making            = EXCLUDED.today_making,
  domains                 = EXCLUDED.domains,
  socials                 = EXCLUDED.socials,
  embed_feed              = EXCLUDED.embed_feed,
  show_email              = EXCLUDED.show_email,
  contact_email           = EXCLUDED.contact_email,
  cracked_squad           = EXCLUDED.cracked_squad,
  press_links             = EXCLUDED.press_links,
  total_raised            = EXCLUDED.total_raised,
  total_valuation         = EXCLUDED.total_valuation,
  total_users             = EXCLUDED.total_users,
  updated_at              = NOW();

-- Verify
SELECT username, name, array_length(domains, 1) AS domain_count, jsonb_array_length(press_links) AS press_count
FROM profiles WHERE username = 'elonmusk';
