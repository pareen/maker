-- Seed: jameshunsaker demo profile
-- James Hunsaker — co-founder/CTO of Monad, CEO of Category Labs
-- Run in the Supabase SQL editor against whichever environment you want.
-- Idempotent: re-running updates the profile and reseeds projects.

DO $$
DECLARE
  user_uuid UUID := '6a3d4e9c-b55f-4019-a2b7-c47e60721124'::uuid;
  user_email TEXT := 'jameshunsaker+demo@makerly.me';
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at
  )
  VALUES (
    user_uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    user_email,
    crypt('demo-jh-' || gen_random_uuid()::text, gen_salt('bf')),
    now(),
    jsonb_build_object('username', 'jameshunsaker'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

INSERT INTO profiles (
  id, username, name, bio, philosophy,
  first_make_description, first_make_age, today_making,
  domains, socials, embed_feed, show_email, contact_email,
  cracked_squad, press_links, total_raised, total_valuation, total_users
)
VALUES (
  '6a3d4e9c-b55f-4019-a2b7-c47e60721124'::uuid,
  'jameshunsaker',
  'James Hunsaker',
  E'I rebuild systems from the bottom up.\nEight years on Jump Trading''s HFT desk building ultra-low-latency execution.\nNow: parallel-execution EVM. Monad mainnet went live November 24, 2025.',
  'Latency is a feature. If the spec is the bottleneck, rewrite the spec.',
  E'Third grade. My mom was a teacher, so the school had Apple IIs I could mess around with after hours. I''d borrow programming magazines from the public library and type the BASIC listings in by hand, debugging my own typos in the morning. Same era, same vibe as a young Elon Musk typing up Blastar a continent away — except mine never made it to magazine print.',
  '9',
  E'Category Labs CEO. We''re the team that built and now extends the Monad blockchain — parallel EVM execution, MonadBFT consensus, MonadDB state engine. Mainnet went live November 24, 2025. Now: scaling block size, onboarding EVM apps, and shipping the next leg of throughput improvements.',
  ARRAY['blockchain', 'software', 'infrastructure', 'fintech', 'ai'],
  jsonb_build_object(
    'twitter',  'https://x.com/_jhunsaker',
    'github',   'https://github.com/jhunsaker',
    'linkedin', 'https://www.linkedin.com/in/jameshunsaker/',
    'substack', '',
    'website',  'https://www.category.xyz'
  ),
  jsonb_build_object('type', 'twitter', 'url', '@_jhunsaker'),
  FALSE,
  '',
  TRUE,
  '[
    {"url": "https://fortune.com/crypto/2024/04/09/monad-paradigm-greenoaks-jump-crypto-funding-225-million/", "source": "Fortune", "title": "Paradigm leads $225M Series A for Monad — largest crypto round of 2024 at a $3B valuation"},
    {"url": "https://www.theblock.co/post/211352/monad-labs-funding-blockchain-former-jump-trading-developers", "source": "The Block", "title": "Former Jump Trading developers raise $19M to build Monad blockchain (2023 seed, Dragonfly-led)"},
    {"url": "https://www.category.xyz/blogs/introducing-category-labs", "source": "Category Labs blog", "title": "Introducing Category Labs — the technical R&D arm of the Monad ecosystem (Dec 2024)"},
    {"url": "https://www.monad.xyz/announcements/introducing-monad-foundation", "source": "Monad Foundation", "title": "The Monad Labs → Category Labs + Monad Foundation split (Dec 2024)"},
    {"url": "https://pitchbook.com/news/articles/monad-labs-225m-paradigm-series-a-unicorn", "source": "PitchBook", "title": "Monad Labs hits unicorn status with $225M raise — largest crypto round of 2024"},
    {"url": "https://iq.wiki/wiki/james-hunsaker", "source": "IQ.wiki", "title": "James Hunsaker — biographical entry covering Goldman → JPM → Jump → Monad arc"},
    {"url": "https://www.youtube.com/watch?v=FCgmG856xx8", "source": "YouTube", "title": "Cracking Monad''s Tech & Vision — long-form interview with me on parallel EVM design decisions"},
    {"url": "https://github.com/jhunsaker", "source": "GitHub", "title": "github.com/jhunsaker — what little of my pre-Monad work survives in public"}
  ]'::jsonb,
  24400000000,      -- $244M in cents (combined: $19M Dragonfly seed + $225M Paradigm Series A)
  300000000000,     -- $3B in cents (Paradigm Series A valuation, Mar 2024)
  5000000           -- ~5M Monad testnet participants (rough order of magnitude)
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

-- Projects (idempotent: wipe + reinsert this user's projects)
DELETE FROM projects WHERE user_id = '6a3d4e9c-b55f-4019-a2b7-c47e60721124'::uuid;

INSERT INTO projects (
  user_id, name, one_liner, role, current_stage, start_date, end_date, ongoing,
  domains, links, outcome, description, featured, key_metric,
  funding_raised, valuation, users_reached
) VALUES

-- 1. Childhood: Apple II BASIC Type-Ins (~3rd grade, ~mid-1990s)
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Apple II BASIC Type-Ins',
 'Type the listings in by hand. Debug your own typos in the morning.',
 'solo', 'idea', '1994-09-01', '1996-06-01', FALSE,
 ARRAY['software', 'gaming'], ARRAY[]::TEXT[],
 'Started in 3rd grade, never stopped.',
 E'My mom was a teacher, so her school had Apple IIs that I could mess around with after hours. I''d borrow programming magazines from the public library and type the BASIC listings in by hand. Half the listing was always wrong — typos in the magazine, typos in my transcription — so debugging-by-tantrum was my first real engineering skill. This is where the eight-year-old who liked making things became the thirty-something who builds parallel EVMs.',
 TRUE, 'Started programming in 3rd grade', 0, 0, 0),

-- 2. Jump Trading HFT execution system (2014-2022)
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Jump Trading HFT Execution System',
 'Eight years building ultra-low-latency execution moving tens of billions/day in major futures markets',
 'contributor', 'revenue', '2014-04-01', '2022-02-01', FALSE,
 ARRAY['fintech', 'infrastructure', 'software'], ARRAY[]::TEXT[],
 'Built and ran the system end-to-end. Met my future co-founder Keone Hon there.',
 E'Eight years on the trading team at Jump, building ultra-low-latency execution systems responsible for tens of billions in notional volume per day across major futures markets. I learned three things that all show up in Monad: (1) latency is the product, (2) you cannot mock physics, and (3) when the spec is wrong, the spec is the thing you change. Met Keone Hon on the same desk.',
 FALSE, '8 years; tens of billions/day notional volume', 0, 0, 0),

-- 3. Monad Labs — the founding company
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Monad Labs',
 'Co-founded Feb 2022 with Keone Hon (CEO) and Eunice Giarta. Building a parallel-execution EVM L1.',
 'cofounder', 'revenue', '2022-02-01', NULL, TRUE,
 ARRAY['blockchain', 'software', 'infrastructure'], ARRAY['https://www.monad.xyz', 'https://www.category.xyz'],
 'Closed $19M Dragonfly-led seed (2023) and $225M Paradigm-led Series A at a $3B valuation (Mar 2024) — largest crypto round of 2024.',
 E'Three Jump alumni building a parallel-execution EVM L1. Founded February 2022 with Keone Hon as CEO, me as CTO, Eunice Giarta as President. Initial $19M seed from Dragonfly Capital in 2023. The big one: Paradigm-led $225M Series A in March 2024 at a $3B valuation — the largest crypto round of 2024 at the time. Reorganized in December 2024 into Category Labs (technical, I''m CEO) + Monad Foundation (ecosystem).',
 TRUE, '$244M raised; $3B valuation; mainnet live Nov 24, 2025', 24400000000, 300000000000, 5000000),

-- 4. Parallel EVM Execution — the core technical innovation
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Parallel EVM Execution',
 'Optimistic parallel execution of Ethereum transactions — same semantics, many cores',
 'cofounder', 'revenue', '2022-02-01', NULL, TRUE,
 ARRAY['blockchain', 'infrastructure'], ARRAY['https://docs.monad.xyz'],
 'The core throughput unlock for Monad — 10,000 TPS target with 1-second blocks, with byte-for-byte Ethereum equivalence.',
 E'Run independent EVM transactions in parallel speculatively. When two conflict, re-order and replay just the conflicting tail. Net effect: bytecode-identical to Ethereum, ordering-identical to a serial execution, but throughput scales with CPU cores instead of being capped by single-thread performance. The thing the EVM was always supposed to be doing.',
 TRUE, '10,000 TPS target with 1-second blocks', 0, 0, 0),

-- 5. MonadBFT consensus
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'MonadBFT',
 'Byzantine-fault-tolerant consensus protocol derived from HotStuff, tuned for fast finality',
 'cofounder', 'revenue', '2022-06-01', NULL, TRUE,
 ARRAY['blockchain', 'infrastructure'], ARRAY['https://docs.monad.xyz/monad-arch/consensus/monadbft'],
 'Sub-second finality at production scale; powering Monad mainnet since Nov 24, 2025.',
 E'BFT consensus derived from HotStuff with single-slot finality optimizations. Designed to maintain rapid finality even at high throughput, which is the whole point of the rest of the stack.',
 TRUE, 'Sub-second finality on mainnet', 0, 0, 0),

-- 6. MonadDB state database
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'MonadDB',
 'Custom state database — Patricia-trie-aware, optimized for low RAM at high throughput',
 'cofounder', 'revenue', '2022-09-01', NULL, TRUE,
 ARRAY['blockchain', 'infrastructure', 'software'], ARRAY['https://docs.monad.xyz/monad-arch/execution/monaddb'],
 'Replaced LevelDB/RocksDB-style storage that was the de-facto bottleneck for every other EVM L1.',
 E'Existing EVM clients use general-purpose KV stores like LevelDB or RocksDB and pay the cost of that abstraction at every state read. MonadDB is built around the Ethereum Merkle Patricia Trie directly, with low-RAM operation as a first-class design goal. The state engine that lets the rest of the stack actually breathe.',
 TRUE, 'Patricia-trie-native state DB', 0, 0, 0),

-- 7. Monad Mainnet Launch (Nov 24, 2025)
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Monad Mainnet',
 'Public mainnet launched November 24, 2025 — the destination for everything above',
 'cofounder', 'users', '2025-11-24', NULL, TRUE,
 ARRAY['blockchain', 'infrastructure'], ARRAY['https://www.monad.xyz/announcements'],
 'Mainnet went live November 24, 2025 at 14:00 UTC. ~5M testnet participants converted to genesis users.',
 E'After ~3.5 years of building, mainnet went live November 24, 2025 at 14:00 UTC. The full stack — parallel EVM execution, MonadBFT consensus, MonadDB state — running together in production for the first time. ~5M testnet participants converted into the genesis cohort.',
 TRUE, 'Mainnet live Nov 24, 2025', 0, 0, 5000000),

-- 8. Category Labs (Dec 2024 - present)
('6a3d4e9c-b55f-4019-a2b7-c47e60721124', 'Category Labs',
 'CEO. Monad Labs reorg''d in Dec 2024 — Category Labs is the technical R&D arm.',
 'cofounder', 'revenue', '2024-12-01', NULL, TRUE,
 ARRAY['blockchain', 'software', 'infrastructure'], ARRAY['https://www.category.xyz'],
 'Took the CEO seat at the technical arm. Keone moved to lead the Monad Foundation.',
 E'In December 2024 we restructured: Monad Labs split into Category Labs (technical development of the Monad protocol — I''m CEO) and the Monad Foundation (ecosystem, governance, adoption — Keone and Eunice). Cleaner separation between "build the chain" and "grow the ecosystem". My job from here is shipping throughput improvements, the next-gen state engine, and the protocol roadmap that takes Monad past where we are at mainnet.',
 TRUE, 'CEO of the technical arm post-Dec 2024 split', 0, 0, 0);

-- Verify
SELECT username, name, jsonb_array_length(press_links) AS press_count
FROM profiles WHERE username = 'jameshunsaker';

SELECT COUNT(*) AS project_count, SUM(CASE WHEN featured THEN 1 ELSE 0 END) AS featured_count
FROM projects WHERE user_id = '6a3d4e9c-b55f-4019-a2b7-c47e60721124'::uuid;
