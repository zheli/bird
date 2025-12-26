import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('TwitterClient', () => {
  const originalFetch = global.fetch;
  const validCookies = {
    authToken: 'test_auth_token',
    ct0: 'test_ct0_token',
    source: 'test',
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should throw if authToken is missing', () => {
      expect(
        () =>
          new TwitterClient({
            cookies: { authToken: null, ct0: 'test', source: null },
          }),
      ).toThrow('Both authToken and ct0 cookies are required');
    });

    it('should throw if ct0 is missing', () => {
      expect(
        () =>
          new TwitterClient({
            cookies: { authToken: 'test', ct0: null, source: null },
          }),
      ).toThrow('Both authToken and ct0 cookies are required');
    });

    it('should create client with valid cookies', () => {
      const client = new TwitterClient({ cookies: validCookies });
      expect(client).toBeInstanceOf(TwitterClient);
    });
  });

  describe('tweet', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should post a tweet successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  rest_id: '1234567890',
                  legacy: {
                    full_text: 'Hello world!',
                  },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Hello world!');

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('1234567890');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('CreateTweet');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.variables.tweet_text).toBe('Hello world!');
      expect(body.features.rweb_video_screen_enabled).toBe(true);
      expect(body.features.creator_subscriptions_tweet_preview_api_enabled).toBe(true);
    });

    it('retries CreateTweet via /i/api/graphql when operation URL 404s', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              create_tweet: {
                tweet_results: {
                  result: {
                    rest_id: '1234567890',
                  },
                },
              },
            },
          }),
        });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Hello world!');

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('1234567890');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [firstUrl] = mockFetch.mock.calls[0];
      const [secondUrl] = mockFetch.mock.calls[1];
      expect(String(firstUrl)).toContain('/CreateTweet');
      expect(String(secondUrl)).toBe('https://x.com/i/api/graphql');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Rate limit exceeded', code: 88 }],
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 403');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should surface missing tweet ID when API responds without rest_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  legacy: { full_text: 'No id' },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.tweet('Hello world!');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tweet created but no ID returned');
    });
  });

  describe('reply', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should post a reply with correct reply_to_tweet_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  rest_id: '9876543210',
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.reply('This is a reply', '1234567890');

      expect(result.success).toBe(true);
      expect(result.tweetId).toBe('9876543210');

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.variables.reply.in_reply_to_tweet_id).toBe('1234567890');
      expect(body.variables.tweet_text).toBe('This is a reply');
      expect(body.features.rweb_video_screen_enabled).toBe(true);
      expect(body.features.creator_subscriptions_tweet_preview_api_enabled).toBe(true);
    });
  });

  describe('getTweet', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should return tweet data from root tweetResult', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            tweetResult: {
              result: {
                rest_id: '12345',
                legacy: {
                  full_text: 'Root tweet text',
                  created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                  reply_count: 1,
                  retweet_count: 2,
                  favorite_count: 3,
                },
                core: {
                  user_results: {
                    result: {
                      legacy: {
                        screen_name: 'user',
                        name: 'User Name',
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('12345');

      expect(result.success).toBe(true);
      expect(result.tweet?.id).toBe('12345');
      expect(result.tweet?.text).toBe('Root tweet text');
      expect(result.tweet?.author.username).toBe('user');
    });

    it('should return tweet data found inside conversation instructions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [
                {
                  entries: [
                    {
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              rest_id: '6789',
                              legacy: {
                                full_text: 'Nested text',
                                created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                                reply_count: 0,
                                retweet_count: 0,
                                favorite_count: 0,
                              },
                              core: {
                                user_results: {
                                  result: {
                                    legacy: {
                                      screen_name: 'nestuser',
                                      name: 'Nested User',
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('6789');

      expect(result.success).toBe(true);
      expect(result.tweet?.text).toBe('Nested text');
      expect(result.tweet?.author.username).toBe('nestuser');
    });

    it('should report HTTP errors from getTweet', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('missing');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 404');
    });

    it('should return article text when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            tweetResult: {
              result: {
                rest_id: 'article123',
                legacy: {
                  full_text: '',
                  created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                },
                article: {
                  article_results: {
                    result: {
                      title: '2025 LLM Year in Review',
                      sections: [
                        {
                          items: [
                            { text: 'Intro paragraph of the article.' },
                            { content: { text: 'Second paragraph.' } },
                          ],
                        },
                      ],
                    },
                  },
                },
                core: {
                  user_results: {
                    result: {
                      legacy: {
                        screen_name: 'author',
                        name: 'Article Author',
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('article123');

      expect(result.success).toBe(true);
      expect(result.tweet?.text).toBe(
        '2025 LLM Year in Review\n\nIntro paragraph of the article.\n\nSecond paragraph.',
      );
    });

    it('should fall back to user article timeline for plain text', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              tweetResult: {
                result: {
                  rest_id: 'article123',
                  legacy: {
                    full_text: '',
                    created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                  },
                  article: {
                    article_results: {
                      result: {
                        title: '2025 LLM Year in Review',
                      },
                    },
                  },
                  core: {
                    user_results: {
                      result: {
                        rest_id: '33836629',
                        legacy: {
                          screen_name: 'author',
                          name: 'Article Author',
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              user: {
                result: {
                  timeline: {
                    timeline: {
                      instructions: [
                        {
                          entries: [
                            {
                              content: {
                                itemContent: {
                                  tweet_results: {
                                    result: {
                                      rest_id: 'article123',
                                      article: {
                                        article_results: {
                                          result: {
                                            title: '2025 LLM Year in Review',
                                            plain_text: 'Full article body.',
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          }),
        });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('article123');

      expect(result.success).toBe(true);
      expect(result.tweet?.text).toBe('2025 LLM Year in Review\n\nFull article body.');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return note tweet text when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            tweetResult: {
              result: {
                rest_id: 'note123',
                legacy: {
                  full_text: '',
                  created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                },
                note_tweet: {
                  note_tweet_results: {
                    result: {
                      text: 'Long form note content.',
                    },
                  },
                },
                core: {
                  user_results: {
                    result: {
                      legacy: {
                        screen_name: 'noter',
                        name: 'Note Author',
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('note123');

      expect(result.success).toBe(true);
      expect(result.tweet?.text).toBe('Long form note content.');
    });

    it('retries TweetDetail query id on 404', async () => {
      const payload = {
        data: {
          tweetResult: {
            result: {
              rest_id: '1',
              legacy: {
                full_text: 'hello',
                created_at: '2024-01-01T00:00:00Z',
                reply_count: 0,
                retweet_count: 0,
                favorite_count: 0,
              },
              core: { user_results: { result: { legacy: { screen_name: 'root', name: 'Root' } } } },
            },
          },
        },
      };

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('1');

      expect(result.success).toBe(true);
      expect(result.tweet?.id).toBe('1');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCurrentUser', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    it('returns mapped user details when present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: '12345',
          screen_name: 'tester',
          name: 'Test User',
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getCurrentUser();

      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: '12345', username: 'tester', name: 'Test User' });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('account/settings'), expect.any(Object));
    });

    it('returns error when response lacks identifiers', async () => {
      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ language: 'en' }),
        text: async () => '{"language":"en"}',
      }));

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getCurrentUser();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not');
    });

    it('surfaces HTTP errors', async () => {
      mockFetch.mockImplementation(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }));

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getCurrentUser();

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 401');
    });

    it('uses HTML fallback when API endpoints 404', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<html>"screen_name":"fallback","user_id":"999"</html>',
        });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getCurrentUser();

      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('fallback');
      expect(result.user?.id).toBe('999');
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('search', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    it('retries on 404 and posts search payload', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              search_by_raw_query: {
                search_timeline: {
                  timeline: {
                    instructions: [
                      {
                        entries: [
                          {
                            content: {
                              itemContent: {
                                tweet_results: {
                                  result: {
                                    rest_id: '1',
                                    legacy: {
                                      full_text: 'found',
                                      created_at: '2024-01-01T00:00:00Z',
                                      reply_count: 0,
                                      retweet_count: 0,
                                      favorite_count: 0,
                                      conversation_id_str: '1',
                                    },
                                    core: {
                                      user_results: {
                                        result: { legacy: { screen_name: 'root', name: 'Root' } },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          }),
        });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.search('needle', 1);

      expect(result.success).toBe(true);
      expect(result.tweets?.[0].id).toBe('1');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [url, options] = mockFetch.mock.calls[1];
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.features).toBeDefined();
      expect(body.queryId).toBeDefined();
      const urlVars = new URL(url as string).searchParams.get('variables');
      expect(urlVars).toBeTruthy();
      const parsed = JSON.parse(urlVars as string) as { rawQuery?: string };
      expect(parsed.rawQuery).toBe('needle');
    });
  });

  describe('conversation helpers', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    const makeConversationPayload = () => ({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              entries: [
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '1',
                          legacy: {
                            full_text: 'root',
                            created_at: '2024-01-01T00:00:00Z',
                            reply_count: 0,
                            retweet_count: 0,
                            favorite_count: 0,
                            conversation_id_str: '1',
                          },
                          core: { user_results: { result: { legacy: { screen_name: 'root', name: 'Root' } } } },
                        },
                      },
                    },
                  },
                },
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '2',
                          legacy: {
                            full_text: 'child reply',
                            created_at: '2024-01-02T00:00:00Z',
                            reply_count: 0,
                            retweet_count: 0,
                            favorite_count: 0,
                            conversation_id_str: '1',
                            in_reply_to_status_id_str: '1',
                          },
                          core: { user_results: { result: { legacy: { screen_name: 'child', name: 'Child' } } } },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });

    it('getReplies returns only replies to tweet', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => makeConversationPayload(),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getReplies('1');

      expect(result.success).toBe(true);
      expect(result.tweets?.length).toBe(1);
      expect(result.tweets?.[0].id).toBe('2');
    });

    it('getThread returns sorted thread by createdAt', async () => {
      const payload = makeConversationPayload();
      // swap dates to verify sorting
      const legacy =
        payload.data.threaded_conversation_with_injections_v2.instructions[0]?.entries?.[0]?.content?.itemContent
          ?.tweet_results?.result?.legacy;
      if (legacy) {
        legacy.created_at = '2024-01-03T00:00:00Z';
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getThread('2');

      expect(result.success).toBe(true);
      expect(result.tweets?.map((t) => t.id)).toEqual(['2', '1']); // sorted by createdAt asc
    });

    it('getThread includes tweets from timeline module items', async () => {
      const payload = makeConversationPayload();
      payload.data.threaded_conversation_with_injections_v2.instructions[0]?.entries?.push({
        content: {
          items: [
            {
              item: {
                itemContent: {
                  tweet_results: {
                    result: {
                      rest_id: '3',
                      legacy: {
                        full_text: 'nested reply',
                        created_at: '2024-01-04T00:00:00Z',
                        reply_count: 0,
                        retweet_count: 0,
                        favorite_count: 0,
                        conversation_id_str: '1',
                        in_reply_to_status_id_str: '1',
                      },
                      core: {
                        user_results: { result: { legacy: { screen_name: 'nested', name: 'Nested' } } },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getThread('1');

      expect(result.success).toBe(true);
      expect(result.tweets?.map((t) => t.id)).toEqual(['1', '2', '3']);
    });

    it('propagates fetchTweetDetail errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'oops',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getThread('1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });
  });
});
