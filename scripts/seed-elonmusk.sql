-- Seed: elonmusk demo profile
-- Run in the Supabase SQL editor against whichever environment you want
-- the profile to appear in (local / staging / prod).
-- Idempotent: re-running updates the profile rather than duplicating it.

DO $$
DECLARE
  user_uuid UUID := '7e10d5ad-1971-4c12-b150-e10a07112002'::uuid;
  user_email TEXT := 'elon@makerly.me';
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
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'demo', true, 'ai_generated', true),
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
  E'[AI-GENERATED DEMO PROFILE]\n\n' ||
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
  FALSE,
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

-- 3. Projects (idempotent: wipe + reinsert this user's projects)
DELETE FROM projects WHERE user_id = '7e10d5ad-1971-4c12-b150-e10a07112002'::uuid;

INSERT INTO projects (
  user_id, name, one_liner, role, current_stage, start_date, end_date, ongoing,
  domains, links, outcome, description, featured, key_metric,
  funding_raised, valuation, users_reached
) VALUES

-- 1. Pretoria Easter Egg Hustle (~1981)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Pretoria Easter Egg Co.',
 'Door-to-door homemade chocolate eggs, Pretoria suburbs, age ~10',
 'cofounder', 'paying', '1981-04-01', '1983-04-30', FALSE,
 ARRAY['food', 'physical'],
 ARRAY[]::TEXT[],
 'Cash-positive at age 10. First taste of margins.',
 E'Kimbal, our cousins, and I made chocolate Easter eggs in our kitchen and sold them door-to-door in the wealthy suburbs of Pretoria. Brutal markups. The grown-ups paid because the kids were charming. First margin business of my life.',
 FALSE, 'Profitable at age ~10', 0, 0, 0),

-- 2. The Failed Pretoria Arcade (1983)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'The 12-Year-Old Arcade',
 'Signed a real arcade lease near our high school. The city killed it.',
 'cofounder', 'idea', '1983-01-01', '1983-06-01', FALSE,
 ARRAY['gaming', 'physical'],
 ARRAY[]::TEXT[],
 'Killed by Pretoria city planning — too young to hold a real-estate permit without an adult co-signer.',
 E'Kimbal, our cousins, and I drew up plans for an arcade next to Pretoria Boys High. We signed a real lease. We filled out the actual real-estate forms at city planning. The clerk eventually noticed the founders were 12 and called our parents, who flipped out.',
 TRUE, 'Lease signed at age 12', 0, 0, 0),

-- 3. Blastar (1984)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Blastar',
 'BASIC space-shooter on the Spectravideo 328 — sold the listing for ~$500',
 'solo', 'paying', '1984-01-01', '1984-12-31', FALSE,
 ARRAY['gaming', 'software'],
 ARRAY['https://blastar-1984.appspot.com/', 'http://jimgerrie.blogspot.com/2021/07/elon-musks-early-type-in-game-blastar.html'],
 'PC and Office Technology paid ~$500 for the listing. Byline: E. R. Musk. Page 69.',
 E'123 lines of BASIC plus a little assembly to get the graphics working. Shoot down hydrogen-bomb-throwing aliens before they kill you with "status beams". Built on a Spectravideo 328 — not an IBM PC — which is why almost no one ever played it. The full HTML5 port is online.',
 TRUE, 'Sold for ~$500 at age 12 (1984)', 0, 0, 0),

-- 4. The Penn Frat House Nightclub (~1992-94)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'The Frat House Nightclub',
 'Rented a 14-bedroom house at Penn, ran it as a paid weekend nightclub',
 'cofounder', 'paying', '1992-09-01', '1994-05-31', FALSE,
 ARRAY['hospitality', 'physical'],
 ARRAY[]::TEXT[],
 'Covered our rent on $5 covers. Roommate Adeo Ressi did the door.',
 E'Adeo Ressi and I rented a 14-bedroom former frat house off-campus and turned it into a weekly nightclub — covers at the door, music, bar. We were paying our rent on Friday-night ticket sales. Never wrote about it; never had to.',
 FALSE, 'Paid the rent in $5 covers', 0, 0, 0),

-- 5. Wharton Master Plan Trilogy (1994-95)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Wharton Master Plan Trilogy',
 'Three undergrad papers that mapped my entire career: solar, internet, EVs',
 'solo', 'idea', '1994-09-01', '1995-05-31', FALSE,
 ARRAY['energy', 'space', 'transportation', 'ai'],
 ARRAY['https://knowledge.wharton.upenn.edu/article/harnessing-the-sun-and-outer-space-elon-musks-sky-high-vision/'],
 'Three predictions, all built later: SolarCity (2006), Tesla (2004), and the indexed internet (Google launched 1996).',
 E'Three business-plan papers written at Penn 1994-95. Paper 1: orbital solar power stations beaming microwave energy back to Earth. Paper 2: putting all of the world''s information into a single database. Paper 3: ultracapacitors as the storage tech for electric vehicles. The professor who reviewed them said they were among the finest theses he''d seen. Almost everything I''ve built since traces back to one of those three.',
 TRUE, '3 papers, 3 multi-billion-dollar companies', 0, 0, 0),

-- 6. Global Link Information Network → Zip2 (1995-1999)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Zip2 (née Global Link Information Network)',
 'First incorporation. Originally a Navteq + Palo Alto biz directory mashup.',
 'cofounder', 'acquired', '1995-11-01', '1999-02-01', FALSE,
 ARRAY['software', 'media'],
 ARRAY['https://en.wikipedia.org/wiki/Zip2'],
 'Compaq acquired for $307M in 1999. I netted $22M, Kimbal $15M.',
 E'Incorporated November 1995 in Palo Alto as Global Link Information Network. Founders: me ($2K in), Kimbal ($5K in), and Greg Kouri ($8K in — the unsung third founder put in the most cash). Combined a free Navteq DB with a Palo Alto business directory. Mohr Davidow''s $3M Series A renamed it Zip2 in 1996 and pivoted us from local merchants to selling city-guide software to newspapers. Compaq paid $307M for it in February 1999.',
 TRUE, '$307M Compaq acquisition (1999)', 300000000, 30700000000, 0),

-- 7. X.com (the bank) (1999-2000)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'X.com (the bank)',
 'A real internet bank. Checking accounts, mutual funds, FDIC insurance.',
 'cofounder', 'paying', '1999-03-01', '2000-03-01', FALSE,
 ARRAY['fintech'],
 ARRAY['https://en.wikipedia.org/wiki/X.com_(bank)'],
 'Merged with Confinity in March 2000 to become PayPal.',
 E'Launched December 7, 1999. Bill Harris (former Intuit CEO) was launch CEO. Partnered with First Western Bank for FDIC and Barclays for the mutual funds and S&P-tracking index funds. A 24-year-old running a real chartered internet bank. Three months later we merged with Confinity, the company building PayPal.',
 FALSE, 'Real chartered bank, online, 1999', 0, 0, 0),

-- 8. PayPal (2000-2002)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'PayPal',
 'Got fired for trying to rename it back to X.com. eBay bought it for $1.5B.',
 'cofounder', 'acquired', '2000-03-01', '2002-10-03', FALSE,
 ARRAY['fintech'],
 ARRAY[]::TEXT[],
 'eBay acquired October 2002 for $1.5B in stock. I netted ~$180M.',
 E'Post-merger I was CEO. I tried to rename the combined company back to X.com because the brand was strategic. The board ousted me on my honeymoon and replaced me with Peter Thiel. I let them — and walked with $180M when eBay bought us in 2002. It took 25 years to get the X.com name back, but I did.',
 FALSE, '$1.5B eBay acquisition', 0, 150000000000, 1200000000),

-- 9. Mars Oasis (2001-2002)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Mars Oasis',
 'A robotic greenhouse to put a living plant on Mars. Direct precursor to SpaceX.',
 'solo', 'idea', '2001-06-01', '2002-05-01', FALSE,
 ARRAY['space', 'robotics'],
 ARRAY['https://www.vice.com/en/article/spacex-is-because-elon-musk-wanted-to-grow-plants-on-mars/', 'https://www.fastcompany.com/3006829/spacex-founder-elon-musk-considered-buying-russian-ballistic-missiles-nukes'],
 'Russian rocket negotiations failed. On the flight home I priced rockets from first principles and decided to build them myself. SpaceX is the backup plan.',
 E'A small lander carrying a glass-enclosed greenhouse to the Martian surface. Land. Scoop in Martian regolith. Grow a plant. Broadcast the photo home as a public-attention stunt to force NASA''s budget upward. To launch it cheaply I flew to Moscow twice — October 2001 and February 2002, the second trip with future NASA Administrator Mike Griffin — to buy refurbished ICBMs. The Russians insulted us out of the room. I built a spreadsheet of rocket cost-from-physics on the flight home.',
 TRUE, 'Pivoted into SpaceX after Russia trips failed', 0, 0, 0),

-- 10. SpaceX (2002-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'SpaceX',
 'Reusable orbital-class rockets. Falcon 9, Crew Dragon, Starlink, Starship.',
 'solo', 'revenue', '2002-03-14', NULL, TRUE,
 ARRAY['space', 'transportation'],
 ARRAY['https://www.spacex.com'],
 'First private company to orbit (Falcon 1, 2008), to dock with the ISS (2012), to fly humans (Crew Dragon, 2020), and to catch a returning booster mid-air (Mechazilla, 2024).',
 E'Founded with $100M of my own money after the Russia trips. Falcon 1 reached orbit in 2008 on the fourth attempt — we were on our last dollars. Falcon 9 became the most-flown rocket in human history; we re-fly the same booster dozens of times. Starlink: ~5M+ subscribers and counting. Starship is the vehicle for Mars.',
 TRUE, '~$350B private valuation', 1500000000000, 35000000000000, 5000000),

-- 11. Tesla (2004-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Tesla',
 'Made EVs the default. Joined Series A as chairman, took over as CEO in 2008.',
 'early_team', 'ipo', '2004-04-01', NULL, TRUE,
 ARRAY['transportation', 'energy', 'robotics', 'ai'],
 ARRAY['https://www.tesla.com'],
 'World''s most valuable automaker. Roadster → Model S/X/3/Y → Cybertruck → Semi → Powerwall → Solar Roof → Optimus.',
 E'Joined Series A in April 2004 as chairman. Took over as CEO during the 2008 crisis. Produced the first credible mass-market EV (Model S, 2012), redefined the segment, and built the Supercharger network. Optimus humanoid robot and FSD now bend Tesla into an AI/robotics company that happens to make cars.',
 TRUE, 'Largest EV maker by market cap', 2500000000000, 80000000000000, 7000000),

-- 12. SolarCity (2006-2016)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'SolarCity',
 'Residential solar at scale. Co-founded with my cousins Lyndon & Peter Rive.',
 'cofounder', 'acquired', '2006-07-04', '2016-11-21', FALSE,
 ARRAY['energy'],
 ARRAY[]::TEXT[],
 'Tesla acquired for $2.6B in 2016 — the controversial all-stock merger that became Tesla Energy.',
 E'Co-founded with my cousins Lyndon and Peter Rive. The thesis traced directly to my 1995 Wharton orbital-solar paper, just at a slightly more practical altitude. Tesla acquired it in 2016 for $2.6B in an all-stock deal that took years of shareholder lawsuits to clear.',
 FALSE, '$2.6B Tesla acquisition', 0, 260000000000, 325000),

-- 13. Hyperloop White Paper (2013)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Hyperloop',
 'Open-source 58-page white paper for a vacuum-tube transit system at near-supersonic speeds',
 'solo', 'idea', '2013-08-12', '2013-08-12', FALSE,
 ARRAY['transportation'],
 ARRAY['https://www.tesla.com/sites/default/files/blog_images/hyperloop-alpha.pdf'],
 'Open-sourced the design. Multiple Hyperloop startups spun up; none yet operational at scale.',
 E'Published a 58-page open-source white paper on a vacuum-tube transit system between LA and SF. Released into the public domain so anyone could build it. I went back to running Tesla and SpaceX.',
 FALSE, 'Open-source design released 2013', 0, 0, 0),

-- 14. OpenAI (2015-2018)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'OpenAI',
 'Co-founded as a non-profit AI lab. Departed the board in 2018.',
 'cofounder', 'revenue', '2015-12-11', '2018-02-20', FALSE,
 ARRAY['ai'],
 ARRAY['https://openai.com'],
 'Departed the board 2018 over direction disagreements + Tesla AI conflicts. Later founded xAI as the alternative.',
 E'Co-founded as a $1B-pledged non-profit AI lab to ensure safe AGI development. Left the board in 2018. They went on to ship ChatGPT and become a for-profit. I went on to start xAI.',
 FALSE, 'Co-founded; departed 2018', 100000000000, 0, 0),

-- 15. The Boring Company (2016-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'The Boring Company',
 'Tunnel boring + Las Vegas Loop + the Not-A-Flamethrower side hustle',
 'solo', 'revenue', '2016-12-17', NULL, TRUE,
 ARRAY['transportation', 'tunneling', 'physical'],
 ARRAY['https://www.boringcompany.com'],
 'Las Vegas Convention Center Loop is operational. $10M raised by selling 20,000 flamethrowers at $500 each.',
 E'Started after I tweeted about LA traffic. Las Vegas Loop is operational. Famous side hustles: 20,000 "Not-A-Flamethrower" units at $500 each ($10M), 50,000 hats at $20 each ($1M), and the Boring Brick — actual brick made from tunnel spoil.',
 FALSE, '$5.7B valuation; $10M from a flamethrower side product', 67500000000, 570000000000, 0),

-- 16. Neuralink (2016-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Neuralink',
 'Brain-computer interface implants. First human implant in 2024.',
 'cofounder', 'users', '2016-07-01', NULL, TRUE,
 ARRAY['neurotech', 'hardware', 'ai'],
 ARRAY['https://neuralink.com'],
 'First human implant 2024 — paralyzed patient operating a computer with thought.',
 E'High-bandwidth brain-computer interface. Started with paralyzed patients controlling computers via thought. Eventual goal: bidirectional whole-brain interface so humans can keep up with AI rather than be left behind.',
 TRUE, 'First human implant (2024)', 80000000000, 800000000000, 3),

-- 17. X (formerly Twitter) (2022-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'X (formerly Twitter)',
 'Acquired Twitter for $44B in 2022. 25 years to get the X.com name back.',
 'solo', 'users', '2022-10-27', NULL, TRUE,
 ARRAY['social', 'fintech', 'ai'],
 ARRAY['https://x.com'],
 'Closed the $44B acquisition October 2022. Cut headcount ~80%. Restored the x.com URL I''d originally bought in 1999.',
 E'I bought x.com back from PayPal in 2017 personally for sentimental reasons — I''d been unable to get the board to call PayPal that. In 2022 I closed the $44B Twitter acquisition and finally got to put the X back on the building. Now an everything-app: Grok integrated, payments rolling out, video, communities.',
 TRUE, '$44B acquisition; ~600M users', 4400000000000, 4400000000000, 600000000),

-- 18. xAI (2023-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'xAI',
 'Maximally truth-seeking AI. Built Colossus, a 100K-GPU H100 cluster, in 122 days.',
 'solo', 'funded', '2023-07-12', NULL, TRUE,
 ARRAY['ai'],
 ARRAY['https://x.ai'],
 'Colossus is the largest AI training cluster on Earth. Built in 122 days in Memphis — the fastest such buildout in history.',
 E'AI lab founded after I left OpenAI''s board. Grok deployed natively into X. Colossus, our 100K-GPU H100 supercluster in Memphis, was stood up in 122 days — the industry consensus said 18-24 months. Doubling to 200K next.',
 TRUE, 'Colossus: 100K H100s in 122 days', 1200000000000, 5000000000000, 30000000),

-- 19. Musk Foundation (2002-)
('7e10d5ad-1971-4c12-b150-e10a07112002', 'Musk Foundation',
 'Family foundation. $100M Carbon Removal XPRIZE — largest incentive prize in history.',
 'solo', 'users', '2002-09-01', NULL, TRUE,
 ARRAY['energy', 'philanthropy', 'ai'],
 ARRAY['https://www.muskfoundation.org', 'https://www.xprize.org/prizes/carbonremoval'],
 '$100M XPRIZE for Carbon Removal — largest incentive prize ever offered.',
 E'Family foundation focused on renewable energy, space exploration, AI safety, pediatric health, and science education. The headline gift: $100M to the XPRIZE Foundation for carbon removal — the largest incentive prize in human history.',
 FALSE, '$100M Carbon Removal XPRIZE', 0, 0, 0);

-- Verify
SELECT username, name, array_length(domains, 1) AS domain_count, jsonb_array_length(press_links) AS press_count
FROM profiles WHERE username = 'elonmusk';

SELECT COUNT(*) AS project_count, SUM(CASE WHEN featured THEN 1 ELSE 0 END) AS featured_count
FROM projects WHERE user_id = '7e10d5ad-1971-4c12-b150-e10a07112002'::uuid;
