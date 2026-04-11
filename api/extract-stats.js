import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { projects } = req.body;
  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    return res.status(400).json({ error: 'No projects provided' });
  }

  const client = new Anthropic({ apiKey });

  const projectDescriptions = projects.map((p, i) =>
    `[${i}] "${p.name}"
  Key metric: "${p.keyMetric || 'none'}"
  One liner: "${p.oneLiner || 'none'}"
  Description: "${(p.description || 'none').slice(0, 500)}"`
  ).join('\n\n');

  const prompt = `Extract financial data from these maker project descriptions. For each project, return:

- fundingRaised: total funding/investment raised in US cents (e.g. $2.5M = 250000000). Use 0 if not mentioned.
- valuation: company/project valuation in US cents. Use 0 if not mentioned. Do NOT confuse revenue, MRR, trading volume, or GMV with valuation. Only use this if "valuation" or "valued at" is explicitly mentioned.
- usersReached: total users/customers/players/readers as a raw count (e.g. 2M users = 2000000). Use 0 if not mentioned. Include MAU, DAU, signups, downloads, etc.

Projects:
${projectDescriptions}

Return ONLY a valid JSON array. One object per project, in order:
[{"index": 0, "fundingRaised": 0, "valuation": 0, "usersReached": 0}, ...]

Rules:
- Be conservative. Only extract data that is clearly stated.
- "monthly volume" or "MRR" or "revenue" is NOT valuation.
- "raised" or "funding" or "seed round" maps to fundingRaised.
- Handle suffixes: M/million/mn = 1000000, B/billion/bn = 1000000000, K/thousand = 1000.
- All dollar amounts must be converted to cents (multiply by 100).
- usersReached is a raw count, not cents.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse LLM response' });
    }

    const results = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Extract stats error:', error);
    return res.status(500).json({ error: error.message || 'LLM call failed' });
  }
}
