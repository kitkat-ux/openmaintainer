import { expect, it } from 'vitest';
import { sanitizeMarkdown, truncate, redact, verifyGithubSignature } from '../src/index.js';
it('neutralizes user/team mentions, hidden HTML and encoded HTML outside code', () => {
  const result = sanitizeMarkdown(
    '@everyone @here @some-user @org/team <script>alert(1)</script><!-- hidden --> &lt;span&gt;',
  );
  expect(result).not.toMatch(/@[a-z]|<script|<!--/i);
  expect(result).toContain('&lt;script&gt;');
  expect(result).toContain('&amp;lt;');
});
it('preserves legitimate fenced and inline code', () => {
  const code = '```ts\nconst html = "<script>@user</script>";\n```\n`@user <T>`';
  expect(sanitizeMarkdown(code)).toBe(code);
});
it('truncate never exceeds its requested bound', () => {
  for (const max of [0, 1, 24, 30, 50, 200])
    expect(truncate('x'.repeat(100), max).length).toBeLessThanOrEqual(max);
});
it('redacts nested credential fields', () => {
  expect(redact({ token: 'x', nested: [{ apiKey: 'y', text: 'Bearer hidden' }] })).toEqual({
    token: '[REDACTED]',
    nested: [{ apiKey: '[REDACTED]', text: 'Bearer [REDACTED]' }],
  });
});
it('rejects empty secret and malformed signature', () => {
  expect(verifyGithubSignature(Buffer.from('{}'), undefined, '')).toBe(false);
  expect(verifyGithubSignature(Buffer.from('{}'), `sha256=${'x'.repeat(64)}`, 's')).toBe(false);
});
it('handles repeated unclosed and nested comment delimiters without backtracking', () => {
  expect(sanitizeMarkdown('before' + '<!--'.repeat(100_000))).toBe('before');
  const output = sanitizeMarkdown('a<!--nested <!-- -->tail-->b <SCRipt>x</SCRipt>');
  expect(output).not.toMatch(/<!--|<script/i);
  expect(output).toContain('&lt;SCRipt&gt;');
});
