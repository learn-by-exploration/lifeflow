const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toDateStr, addDays } = require('../src/utils/date');

describe('date utils', () => {
  it('formats local calendar dates as YYYY-MM-DD', () => {
    const value = new Date(2026, 3, 14, 23, 45, 0, 0);
    assert.equal(toDateStr(value), '2026-04-14');
  });

  it('adds days across month boundaries', () => {
    const value = new Date(2026, 0, 31, 12, 0, 0, 0);
    assert.equal(toDateStr(addDays(value, 1)), '2026-02-01');
  });

  it('adds negative days across year boundaries', () => {
    const value = new Date(2026, 0, 1, 12, 0, 0, 0);
    assert.equal(toDateStr(addDays(value, -1)), '2025-12-31');
  });
});