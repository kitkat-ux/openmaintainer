import { describe, expect, it } from 'vitest';
import { jaccardSimilarity, sanitizeMarkdown, verifyGithubSignature } from '../src/index.js';
import { createHmac } from 'node:crypto';
describe('shared security utilities', () => {
  it('verifies webhook signatures', () => {
    const body = Buffer.from('{}');
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifyGithubSignature(body, signature, 'secret')).toBe(true);
    expect(verifyGithubSignature(body, signature, 'wrong')).toBe(false);
  });
  it('removes unsafe markdown controls', () => {
    expect(sanitizeMarkdown('@everyone <!-- hide -->')).toBe('@\u200beveryone ');
  });
  it('computes bounded similarity', () => {
    expect(jaccardSimilarity('database query failure', 'database query failure')).toBe(1);
    expect(jaccardSimilarity('', 'x')).toBe(0);
  });
});
