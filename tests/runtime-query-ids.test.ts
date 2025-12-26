import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeQueryIdStore } from '../src/lib/runtime-query-ids.js';

describe('runtime-query-ids', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes IDs by scanning discovered bundles and persists cache', async () => {
    const cacheDir = path.join(os.tmpdir(), `bird-test-${randomUUID()}`);
    await mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, 'query-ids.json');

    const html = `
      <html>
        <script src="https://abs.twimg.com/responsive-web/client-web/main.test.js"></script>
      </html>
    `;
    const js = [
      `e.exports={queryId:"AAA",operationName:"CreateTweet"}`,
      `e.exports={queryId:"BBB",operationName:"CreateRetweet"}`,
      `e.exports={queryId:"CCC",operationName:"FavoriteTweet"}`,
      `e.exports={queryId:"DDD",operationName:"TweetDetail"}`,
      `e.exports={queryId:"EEE",operationName:"SearchTimeline"}`,
      `e.exports={queryId:"FFF",operationName:"UserArticlesTweets"}`,
    ].join('\n');

    const fetchMock = vi.fn(async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://x.com/')) {
        return new Response(html, { status: 200 });
      }
      if (asString.startsWith('https://abs.twimg.com/')) {
        return new Response(js, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const store = createRuntimeQueryIdStore({
      cachePath,
      ttlMs: 1000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const info = await store.refresh(
      ['CreateTweet', 'CreateRetweet', 'FavoriteTweet', 'TweetDetail', 'SearchTimeline', 'UserArticlesTweets'],
      { force: true },
    );

    expect(info?.snapshot.ids.CreateTweet).toBe('AAA');
    expect(info?.snapshot.ids.TweetDetail).toBe('DDD');
    expect(info?.cachePath).toBe(cachePath);

    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as { ids?: Record<string, string> };
    expect(parsed.ids?.SearchTimeline).toBe('EEE');
  });
});
