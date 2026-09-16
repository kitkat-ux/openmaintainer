import { describe, expect, it } from 'vitest';
import { ConfigSchema, parseConfig } from '../src/index.js';
describe('configuration', () => {
  it('applies safe defaults', () => {
    const config = parseConfig({ version: 1 });
    expect(config.review.minimumConfidence).toBe(0.72);
    expect(config.privacy.telemetry).toBe(false);
  });
  it('rejects unknown major versions and fields', () => {
    expect(() => parseConfig({ version: 2 })).toThrow(/version/);
    expect(() => parseConfig({ version: 1, unsafe: true })).toThrow(/Unrecognized key/);
  });
  it('validates confidence range', () => {
    expect(() => parseConfig({ version: 1, review: { minimumConfidence: 2 } })).toThrow(
      /minimumConfidence/,
    );
  });
  expect(ConfigSchema).toBeDefined();
});
