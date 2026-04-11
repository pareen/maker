import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatNumber,
  parseCurrencyInput,
  parseNumberInput,
  formatCentsPreview,
  formatNumberPreview
} from '../src/lib/format';

describe('formatCurrency', () => {
  it('returns null for null/0/undefined', () => {
    expect(formatCurrency(null)).toBe(null);
    expect(formatCurrency(0)).toBe(null);
    expect(formatCurrency(undefined)).toBe(null);
  });

  it('formats small amounts in dollars', () => {
    expect(formatCurrency(500)).toBe('$5');
    expect(formatCurrency(9999)).toBe('$100');
  });

  it('formats thousands as K', () => {
    expect(formatCurrency(25000000)).toBe('$250K');
    expect(formatCurrency(100000)).toBe('$1K');
  });

  it('formats millions as M', () => {
    expect(formatCurrency(150000000)).toBe('$1.5M');
    expect(formatCurrency(1000000000)).toBe('$10M');
  });

  it('formats billions as B', () => {
    expect(formatCurrency(150000000000)).toBe('$1.5B');
  });

  it('strips trailing .0', () => {
    expect(formatCurrency(100000000)).toBe('$1M');
    expect(formatCurrency(100000000000)).toBe('$1B');
  });
});

describe('formatNumber', () => {
  it('returns null for null/0/undefined', () => {
    expect(formatNumber(null)).toBe(null);
    expect(formatNumber(0)).toBe(null);
    expect(formatNumber(undefined)).toBe(null);
  });

  it('returns raw number for small values', () => {
    expect(formatNumber(500)).toBe('500');
    expect(formatNumber(1)).toBe('1');
  });

  it('formats thousands as K', () => {
    expect(formatNumber(50000)).toBe('50K');
    expect(formatNumber(1000)).toBe('1K');
  });

  it('formats millions as M', () => {
    expect(formatNumber(2100000)).toBe('2.1M');
    expect(formatNumber(1000000)).toBe('1M');
  });

  it('formats billions as B', () => {
    expect(formatNumber(1500000000)).toBe('1.5B');
  });
});

describe('parseCurrencyInput', () => {
  it('returns 0 for empty/null/garbage', () => {
    expect(parseCurrencyInput('')).toBe(0);
    expect(parseCurrencyInput(null)).toBe(0);
    expect(parseCurrencyInput('garbage')).toBe(0);
    expect(parseCurrencyInput('abc123')).toBe(0);
  });

  it('parses raw numbers as dollars to cents', () => {
    expect(parseCurrencyInput('500000')).toBe(50000000);
    expect(parseCurrencyInput('100')).toBe(10000);
  });

  it('parses K suffix', () => {
    expect(parseCurrencyInput('250K')).toBe(25000000);
    expect(parseCurrencyInput('250k')).toBe(25000000);
  });

  it('parses M suffix', () => {
    expect(parseCurrencyInput('$1.5M')).toBe(150000000);
    expect(parseCurrencyInput('1.5m')).toBe(150000000);
  });

  it('parses B suffix', () => {
    expect(parseCurrencyInput('2B')).toBe(200000000000);
  });

  it('strips dollar signs, commas, spaces', () => {
    expect(parseCurrencyInput('$ 1,500')).toBe(150000);
    expect(parseCurrencyInput('$1.5M')).toBe(150000000);
  });
});

describe('parseNumberInput', () => {
  it('returns 0 for empty/null/garbage', () => {
    expect(parseNumberInput('')).toBe(0);
    expect(parseNumberInput(null)).toBe(0);
    expect(parseNumberInput('garbage')).toBe(0);
  });

  it('parses raw numbers', () => {
    expect(parseNumberInput('500000')).toBe(500000);
  });

  it('parses K suffix', () => {
    expect(parseNumberInput('50K')).toBe(50000);
    expect(parseNumberInput('50k')).toBe(50000);
  });

  it('parses M suffix', () => {
    expect(parseNumberInput('2.1M')).toBe(2100000);
  });

  it('parses B suffix', () => {
    expect(parseNumberInput('1B')).toBe(1000000000);
  });
});

describe('formatCentsPreview', () => {
  it('returns empty string for 0/null', () => {
    expect(formatCentsPreview(0)).toBe('');
    expect(formatCentsPreview(null)).toBe('');
  });

  it('formats cents as localized dollar string', () => {
    expect(formatCentsPreview(150000000)).toBe('$1,500,000');
    expect(formatCentsPreview(10000)).toBe('$100');
  });
});

describe('formatNumberPreview', () => {
  it('returns empty string for 0/null', () => {
    expect(formatNumberPreview(0)).toBe('');
    expect(formatNumberPreview(null)).toBe('');
  });

  it('formats with commas', () => {
    expect(formatNumberPreview(50000)).toBe('50,000');
    expect(formatNumberPreview(2100000)).toBe('2,100,000');
  });
});
