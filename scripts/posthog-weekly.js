#!/usr/bin/env node
/**
 * Pull Makerly's weekly PostHog metrics and print a review.
 * Run: node scripts/posthog-weekly.js
 * Env:  POSTHOG_PERSONAL_API_KEY  (required — create at https://us.posthog.com/settings/user-api-keys)
 *       POSTHOG_HOST              (default https://us.posthog.com)
 *       POSTHOG_PROJECT_ID        (optional — auto-detected from /api/projects/ if unset)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnvLocal();

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const HOST = process.env.POSTHOG_HOST || 'https://us.posthog.com';
let PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

if (!KEY) {
  console.error('Missing POSTHOG_PERSONAL_API_KEY. Create one at https://us.posthog.com/settings/user-api-keys');
  process.exit(1);
}

async function ph(path, opts = {}) {
  const res = await fetch(`${HOST}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function resolveProject() {
  if (PROJECT_ID) return PROJECT_ID;
  const { results } = await ph('/api/projects/');
  const makerly = results.find((p) => /makerly/i.test(p.name)) || results[0];
  PROJECT_ID = makerly.id;
  console.log(`Project: ${makerly.name} (id=${PROJECT_ID})`);
  return PROJECT_ID;
}

async function query(hogql) {
  const { results } = await ph(`/api/projects/${PROJECT_ID}/query/`, {
    method: 'POST',
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  return results;
}

function fmtRows(rows) {
  return rows.map((r) => '  ' + r.join('  ')).join('\n');
}

async function main() {
  await resolveProject();
  const nowISO = new Date().toISOString();
  const weekAgoISO = new Date(Date.now() - 7 * 864e5).toISOString();
  const twoWeeksAgoISO = new Date(Date.now() - 14 * 864e5).toISOString();

  console.log(`\n=== Makerly PostHog Weekly Review ===`);
  console.log(`Window: ${weekAgoISO.slice(0, 10)} → ${nowISO.slice(0, 10)}\n`);

  // 1) Event totals this week vs last week
  const totals = await query(`
    SELECT event,
           countIf(timestamp >= '${weekAgoISO}') AS this_week,
           countIf(timestamp >= '${twoWeeksAgoISO}' AND timestamp < '${weekAgoISO}') AS last_week
    FROM events
    WHERE timestamp >= '${twoWeeksAgoISO}'
      AND event IN ('signed_up','signed_in','project_created','update_posted','profile_shared','contact_form_opened','contact_form_submitted','welcome_blast_sent','welcome_blast_dry_run')
    GROUP BY event
    ORDER BY this_week DESC
  `);
  console.log('Event totals (this week / last week / Δ):');
  console.log(fmtRows(totals.map(([e, t, l]) => [e.padEnd(26), String(t).padStart(5), String(l).padStart(5), ((t - l >= 0 ? '+' : '') + (t - l)).padStart(6)])));

  // 2) Share platform breakdown
  const shares = await query(`
    SELECT properties.platform AS platform, count() AS n
    FROM events
    WHERE event = 'profile_shared' AND timestamp >= '${weekAgoISO}'
    GROUP BY platform ORDER BY n DESC
  `);
  console.log('\nProfile shares by platform:');
  console.log(shares.length ? fmtRows(shares) : '  (none)');

  // 3) Contact form conversion
  const contact = await query(`
    SELECT
      countIf(event = 'contact_form_opened') AS opened,
      countIf(event = 'contact_form_submitted') AS submitted
    FROM events WHERE timestamp >= '${weekAgoISO}'
  `);
  const [opened, submitted] = contact[0] || [0, 0];
  const conv = opened ? ((submitted / opened) * 100).toFixed(1) : '—';
  console.log(`\nContact form: ${opened} opened → ${submitted} submitted (${conv}% conv)`);

  // 4) Welcome-email UTM attribution
  const utm = await query(`
    SELECT properties.utm_content AS content, count() AS n, uniq(distinct_id) AS users
    FROM events
    WHERE properties.utm_campaign = 'welcome_blast' AND timestamp >= '${weekAgoISO}'
    GROUP BY content ORDER BY n DESC
  `);
  console.log('\nWelcome-email attribution (utm_content / events / unique):');
  console.log(utm.length ? fmtRows(utm) : '  (none)');

  // 5) Activation funnel — signed up in window → created project → shared
  const funnel = await query(`
    WITH signups AS (
      SELECT distinct_id FROM events
      WHERE event = 'signed_up' AND timestamp >= '${weekAgoISO}'
    ),
    creators AS (
      SELECT DISTINCT distinct_id FROM events
      WHERE event = 'project_created' AND timestamp >= '${weekAgoISO}' AND distinct_id IN signups
    ),
    sharers AS (
      SELECT DISTINCT distinct_id FROM events
      WHERE event = 'profile_shared' AND timestamp >= '${weekAgoISO}' AND distinct_id IN signups
    )
    SELECT
      (SELECT count() FROM signups) AS signed_up,
      (SELECT count() FROM creators) AS created_project,
      (SELECT count() FROM sharers) AS shared_profile
  `);
  const [s, c, sh] = funnel[0] || [0, 0, 0];
  console.log(`\nActivation funnel (this week's signups):`);
  console.log(`  signed_up:        ${s}`);
  console.log(`  created_project:  ${c}  ${s ? `(${((c / s) * 100).toFixed(0)}%)` : ''}`);
  console.log(`  shared_profile:   ${sh}  ${s ? `(${((sh / s) * 100).toFixed(0)}%)` : ''}`);
  console.log();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
