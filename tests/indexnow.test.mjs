import test from 'node:test';
import assert from 'node:assert/strict';
import { recentUrls } from '../scripts/indexnow.mjs';

const xml = `<urlset>
  <url><loc>https://x.test/</loc><lastmod>2026-10-27</lastmod></url>
  <url><loc>https://x.test/old/</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://x.test/a?b=1&amp;c=2</loc><lastmod>2026-10-26</lastmod></url>
</urlset>`;
test('IndexNow only sends URLs changed in the last two days, with entities decoded', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  assert.deepEqual(recentUrls(xml, now), ['https://x.test/', 'https://x.test/a?b=1&c=2']);
  assert.equal(recentUrls(xml, now, Infinity).length, 3);
});
