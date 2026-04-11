// Formatting helpers for currency and number display/parsing

export function formatCurrency(cents) {
  if (!cents || cents === 0) return null;
  const dollars = cents / 100;
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (dollars >= 999_500) return `$${(dollars / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

export function formatNumber(n) {
  if (!n || n === 0) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

// Parse user-friendly currency input ("1.5M", "250K", "500000") to cents
export function parseCurrencyInput(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[$,\s]/g, '').toUpperCase();
  const match = cleaned.match(/^(\d+\.?\d*)(B|M|K)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  const multiplier = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return Math.round(num * multiplier * 100);
}

// Parse user-friendly number input ("50K", "2.1M", "500000") to raw count
export function parseNumberInput(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[,\s]/g, '').toUpperCase();
  const match = cleaned.match(/^(\d+\.?\d*)(B|M|K)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  const multiplier = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return Math.round(num * multiplier);
}

// Format cents as a readable dollar string for input preview
export function formatCentsPreview(cents) {
  if (!cents || cents === 0) return '';
  return `$${(cents / 100).toLocaleString('en-US')}`;
}

// Format a raw number with commas for input preview
export function formatNumberPreview(n) {
  if (!n || n === 0) return '';
  return n.toLocaleString('en-US');
}
