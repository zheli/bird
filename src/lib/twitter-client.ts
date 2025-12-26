/**
 * Twitter GraphQL API client for posting tweets and replies
 */

import type { TwitterCookies } from './cookies.js';
import queryIds from './query-ids.json' with { type: 'json' };

const TWITTER_API_BASE = 'https://x.com/i/api/graphql';
const TWITTER_GRAPHQL_POST_URL = 'https://x.com/i/api/graphql';

// Query IDs rotate frequently; the values in query-ids.json are refreshed by
// scripts/update-query-ids.ts. The fallback values keep the client usable if
// the file is missing or incomplete.
const FALLBACK_QUERY_IDS = {
  CreateTweet: 'TAJw1rBsjAtdNgTdlo2oeg',
  CreateRetweet: 'ojPdsZsimiJrUGLR1sjUtA',
  FavoriteTweet: 'lI07N6Otwv1PhnEgXILM7A',
  TweetDetail: '97JF30KziU00483E_8elBA',
  SearchTimeline: 'M1jEez78PEfVfbQLvlWMvQ',
  UserArticlesTweets: '8zBy9h4L90aDL02RsBcCFg',
} as const;

type OperationName = keyof typeof FALLBACK_QUERY_IDS;

const QUERY_IDS: Record<OperationName, string> = {
  ...FALLBACK_QUERY_IDS,
  ...(queryIds as Partial<Record<OperationName, string>>),
};

const TWEET_DETAIL_QUERY_IDS = Array.from(
  new Set([QUERY_IDS.TweetDetail, '97JF30KziU00483E_8elBA', 'aFvUsJm2c-oDkJV75blV6g']),
);

const SEARCH_TIMELINE_QUERY_IDS = Array.from(
  new Set([QUERY_IDS.SearchTimeline, 'M1jEez78PEfVfbQLvlWMvQ', '5h0kNbk3ii97rmfY6CdgAA', 'Tp1sewRU1AsZpBWhqCZicQ']),
);

type GraphqlTweetResult = {
  rest_id?: string;
  legacy?: {
    full_text?: string;
    created_at?: string;
    reply_count?: number;
    retweet_count?: number;
    favorite_count?: number;
    conversation_id_str?: string;
    in_reply_to_status_id_str?: string | null;
  };
  core?: {
    user_results?: {
      result?: {
        rest_id?: string;
        id?: string;
        legacy?: {
          screen_name?: string;
          name?: string;
        };
        core?: {
          screen_name?: string;
          name?: string;
        };
      };
    };
  };
  note_tweet?: {
    note_tweet_results?: {
      result?: {
        text?: string;
        richtext?: {
          text?: string;
        };
        rich_text?: {
          text?: string;
        };
        content?: {
          text?: string;
          richtext?: {
            text?: string;
          };
          rich_text?: {
            text?: string;
          };
        };
      };
    };
  };
  article?: {
    article_results?: {
      result?: {
        title?: string;
        plain_text?: string;
        text?: string;
        richtext?: {
          text?: string;
        };
        rich_text?: {
          text?: string;
        };
        body?: {
          text?: string;
          richtext?: {
            text?: string;
          };
          rich_text?: {
            text?: string;
          };
        };
        content?: {
          text?: string;
          richtext?: {
            text?: string;
          };
          rich_text?: {
            text?: string;
          };
          items?: Array<{
            text?: string;
            content?: {
              text?: string;
              richtext?: { text?: string };
              rich_text?: { text?: string };
            };
          }>;
        };
        sections?: Array<{
          items?: Array<{
            text?: string;
            content?: {
              text?: string;
              richtext?: { text?: string };
              rich_text?: { text?: string };
            };
          }>;
        }>;
      };
    };
    title?: string;
    plain_text?: string;
    text?: string;
    richtext?: {
      text?: string;
    };
    rich_text?: {
      text?: string;
    };
    body?: {
      text?: string;
      richtext?: {
        text?: string;
      };
      rich_text?: {
        text?: string;
      };
    };
    content?: {
      text?: string;
      richtext?: {
        text?: string;
      };
      rich_text?: {
        text?: string;
      };
      items?: Array<{
        text?: string;
        content?: {
          text?: string;
          richtext?: { text?: string };
          rich_text?: { text?: string };
        };
      }>;
    };
    sections?: Array<{
      items?: Array<{
        text?: string;
        content?: {
          text?: string;
          richtext?: { text?: string };
          rich_text?: { text?: string };
        };
      }>;
    }>;
  };
};

export interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

export interface TweetData {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
  };
  authorId?: string;
  createdAt?: string;
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  conversationId?: string;
  inReplyToStatusId?: string;
}

export interface GetTweetResult {
  success: boolean;
  tweet?: TweetData;
  error?: string;
}

export interface SearchResult {
  success: boolean;
  tweets?: TweetData[];
  error?: string;
}

export interface CurrentUserResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    name: string;
  };
  error?: string;
}

export interface TwitterClientOptions {
  cookies: TwitterCookies;
  userAgent?: string;
  timeoutMs?: number;
}

interface CreateTweetResponse {
  data?: {
    create_tweet?: {
      tweet_results?: {
        result?: {
          rest_id?: string;
          legacy?: {
            full_text?: string;
          };
        };
      };
    };
  };
  errors?: Array<{ message: string; code?: number }>;
}

export class TwitterClient {
  private authToken: string;
  private ct0: string;
  private userAgent: string;
  private timeoutMs?: number;

  constructor(options: TwitterClientOptions) {
    if (!options.cookies.authToken || !options.cookies.ct0) {
      throw new Error('Both authToken and ct0 cookies are required');
    }
    this.authToken = options.cookies.authToken;
    this.ct0 = options.cookies.ct0;
    this.userAgent =
      options.userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this.timeoutMs = options.timeoutMs;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs <= 0) {
      return fetch(url, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private findTweetInInstructions(
    instructions:
      | Array<{
          entries?: Array<{
            content?: {
              itemContent?: {
                tweet_results?: {
                  result?: GraphqlTweetResult;
                };
              };
            };
          }>;
        }>
      | undefined,
    tweetId: string,
  ) {
    if (!instructions) return undefined;

    for (const instruction of instructions) {
      for (const entry of instruction.entries || []) {
        const result = entry.content?.itemContent?.tweet_results?.result;
        if (result?.rest_id === tweetId) {
          return result;
        }
      }
    }

    return undefined;
  }

  private getHeaders(): Record<string, string> {
    return {
      authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'content-type': 'application/json',
      'x-csrf-token': this.ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
      'user-agent': this.userAgent,
      origin: 'https://x.com',
      referer: 'https://x.com/',
    };
  }

  private firstText(...values: Array<string | undefined | null>): string | undefined {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return undefined;
  }

  private collectTextFields(value: unknown, keys: Set<string>, output: string[]): void {
    if (!value) return;
    if (typeof value === 'string') return;

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectTextFields(item, keys, output);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (keys.has(key)) {
          if (typeof nested === 'string') {
            const trimmed = nested.trim();
            if (trimmed) output.push(trimmed);
            continue;
          }
        }
        this.collectTextFields(nested, keys, output);
      }
    }
  }

  private uniqueOrdered(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      if (seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  private extractArticleText(result: GraphqlTweetResult | undefined): string | undefined {
    const article = result?.article;
    if (!article) return undefined;

    const articleResult = article.article_results?.result ?? article;
    if (process.env.BIRD_DEBUG_ARTICLE === '1') {
      console.error(
        '[bird][debug][article] payload:',
        JSON.stringify(
          {
            rest_id: result?.rest_id,
            article: articleResult,
            note_tweet: result?.note_tweet?.note_tweet_results?.result ?? null,
          },
          null,
          2,
        ),
      );
    }
    const title = this.firstText(articleResult.title, article.title);
    let body = this.firstText(
      articleResult.plain_text,
      article.plain_text,
      articleResult.body?.text,
      articleResult.body?.richtext?.text,
      articleResult.body?.rich_text?.text,
      articleResult.content?.text,
      articleResult.content?.richtext?.text,
      articleResult.content?.rich_text?.text,
      articleResult.text,
      articleResult.richtext?.text,
      articleResult.rich_text?.text,
      article.body?.text,
      article.body?.richtext?.text,
      article.body?.rich_text?.text,
      article.content?.text,
      article.content?.richtext?.text,
      article.content?.rich_text?.text,
      article.text,
      article.richtext?.text,
      article.rich_text?.text,
    );

    if (body && title && body.trim() === title.trim()) {
      body = undefined;
    }

    if (!body) {
      const collected: string[] = [];
      this.collectTextFields(articleResult, new Set(['text', 'title']), collected);
      this.collectTextFields(article, new Set(['text', 'title']), collected);
      const unique = this.uniqueOrdered(collected);
      const filtered = title ? unique.filter((value) => value !== title) : unique;
      if (filtered.length > 0) {
        body = filtered.join('\n\n');
      }
    }

    if (title && body && !body.startsWith(title)) {
      return `${title}\n\n${body}`;
    }

    return body ?? title;
  }

  private extractNoteTweetText(result: GraphqlTweetResult | undefined): string | undefined {
    const note = result?.note_tweet?.note_tweet_results?.result;
    if (!note) return undefined;

    return this.firstText(
      note.text,
      note.richtext?.text,
      note.rich_text?.text,
      note.content?.text,
      note.content?.richtext?.text,
      note.content?.rich_text?.text,
    );
  }

  private extractTweetText(result: GraphqlTweetResult | undefined): string | undefined {
    return (
      this.extractArticleText(result) ?? this.extractNoteTweetText(result) ?? this.firstText(result?.legacy?.full_text)
    );
  }

  private mapTweetResult(result: GraphqlTweetResult | undefined): TweetData | undefined {
    const userResult = result?.core?.user_results?.result;
    const userLegacy = userResult?.legacy;
    const userCore = userResult?.core;
    const username = userLegacy?.screen_name ?? userCore?.screen_name;
    const name = userLegacy?.name ?? userCore?.name ?? username;
    const userId = userResult?.rest_id;
    if (!result?.rest_id || !username) return undefined;

    const text = this.extractTweetText(result);
    if (!text) return undefined;

    return {
      id: result.rest_id,
      text,
      createdAt: result.legacy?.created_at,
      replyCount: result.legacy?.reply_count,
      retweetCount: result.legacy?.retweet_count,
      likeCount: result.legacy?.favorite_count,
      conversationId: result.legacy?.conversation_id_str,
      inReplyToStatusId: result.legacy?.in_reply_to_status_id_str ?? undefined,
      author: {
        username,
        name: name || username,
      },
      authorId: userId,
    };
  }

  private collectTweetResultsFromEntry(entry: {
    content?: {
      itemContent?: {
        tweet_results?: {
          result?: GraphqlTweetResult;
        };
      };
      item?: {
        itemContent?: {
          tweet_results?: {
            result?: GraphqlTweetResult;
          };
        };
      };
      items?: Array<{
        item?: {
          itemContent?: {
            tweet_results?: {
              result?: GraphqlTweetResult;
            };
          };
        };
        itemContent?: {
          tweet_results?: {
            result?: GraphqlTweetResult;
          };
        };
        content?: {
          itemContent?: {
            tweet_results?: {
              result?: GraphqlTweetResult;
            };
          };
        };
      }>;
    };
  }): GraphqlTweetResult[] {
    const results: GraphqlTweetResult[] = [];
    const pushResult = (result?: GraphqlTweetResult) => {
      if (result?.rest_id) results.push(result);
    };

    const content = entry.content;
    pushResult(content?.itemContent?.tweet_results?.result);
    pushResult(content?.item?.itemContent?.tweet_results?.result);

    for (const item of content?.items ?? []) {
      pushResult(item?.item?.itemContent?.tweet_results?.result);
      pushResult(item?.itemContent?.tweet_results?.result);
      pushResult(item?.content?.itemContent?.tweet_results?.result);
    }

    return results;
  }

  private parseTweetsFromInstructions(
    instructions:
      | Array<{
          entries?: Array<{
            content?: {
              itemContent?: {
                tweet_results?: {
                  result?: GraphqlTweetResult;
                };
              };
              item?: {
                itemContent?: {
                  tweet_results?: {
                    result?: GraphqlTweetResult;
                  };
                };
              };
              items?: Array<{
                item?: {
                  itemContent?: {
                    tweet_results?: {
                      result?: GraphqlTweetResult;
                    };
                  };
                };
                itemContent?: {
                  tweet_results?: {
                    result?: GraphqlTweetResult;
                  };
                };
                content?: {
                  itemContent?: {
                    tweet_results?: {
                      result?: GraphqlTweetResult;
                    };
                  };
                };
              }>;
            };
          }>;
        }>
      | undefined,
  ): TweetData[] {
    const tweets: TweetData[] = [];
    const seen = new Set<string>();

    for (const instruction of instructions ?? []) {
      for (const entry of instruction.entries ?? []) {
        const results = this.collectTweetResultsFromEntry(entry);
        for (const result of results) {
          const mapped = this.mapTweetResult(result);
          if (!mapped || seen.has(mapped.id)) continue;
          seen.add(mapped.id);
          tweets.push(mapped);
        }
      }
    }

    return tweets;
  }

  private buildArticleFeatures(): Record<string, boolean> {
    return {
      rweb_video_screen_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_enhance_cards_enabled: false,
    };
  }

  private buildTweetDetailFeatures(): Record<string, boolean> {
    return {
      ...this.buildArticleFeatures(),
      responsive_web_graphql_exclude_directive_enabled: true,
      communities_web_enable_tweet_community_results_fetch: true,
      responsive_web_twitter_article_plain_text_enabled: true,
      responsive_web_twitter_article_seed_tweet_detail_enabled: true,
      responsive_web_twitter_article_seed_tweet_summary_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      verified_phone_label_enabled: false,
    };
  }

  private buildArticleFieldToggles(): Record<string, boolean> {
    return {
      withPayments: false,
      withAuxiliaryUserLabels: false,
      withArticleRichContentState: true,
      withArticlePlainText: true,
      withGrokAnalyze: false,
      withDisallowedReplyControls: false,
    };
  }

  private buildSearchFeatures(): Record<string, boolean> {
    return {
      rweb_video_screen_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      articles_preview_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    };
  }

  private async fetchUserArticlePlainText(
    userId: string,
    tweetId: string,
  ): Promise<{ title?: string; plainText?: string }> {
    const variables = {
      userId,
      count: 20,
      includePromotedContent: true,
      withVoice: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withCommunity: true,
      withSafetyModeUserFields: true,
      withSuperFollowsUserFields: true,
      withDownvotePerspective: false,
      withReactionsMetadata: false,
      withReactionsPerspective: false,
      withSuperFollowsTweetFields: true,
      withSuperFollowsReplyCount: false,
      withClientEventToken: false,
    };

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(this.buildArticleFeatures()),
      fieldToggles: JSON.stringify(this.buildArticleFieldToggles()),
    });

    const url = `${TWITTER_API_BASE}/${QUERY_IDS.UserArticlesTweets}/UserArticlesTweets?${params}`;

    try {
      const response = await this.fetchWithTimeout(url, { method: 'GET', headers: this.getHeaders() });
      if (!response.ok) {
        return {};
      }

      const data = (await response.json()) as {
        data?: {
          user?: {
            result?: {
              timeline?: {
                timeline?: {
                  instructions?: Array<{
                    entries?: Array<{
                      content?: {
                        itemContent?: {
                          tweet_results?: { result?: GraphqlTweetResult };
                        };
                      };
                    }>;
                  }>;
                };
              };
            };
          };
        };
      };

      const instructions = data.data?.user?.result?.timeline?.timeline?.instructions ?? [];
      for (const instruction of instructions) {
        for (const entry of instruction.entries ?? []) {
          const result = entry.content?.itemContent?.tweet_results?.result;
          if (result?.rest_id !== tweetId) continue;
          const articleResult = result.article?.article_results?.result;
          const title = this.firstText(articleResult?.title, result.article?.title);
          const plainText = this.firstText(articleResult?.plain_text, result.article?.plain_text);
          return { title, plainText };
        }
      }
    } catch {
      return {};
    }

    return {};
  }

  private async fetchTweetDetail(tweetId: string): Promise<
    | {
        success: true;
        data: {
          tweetResult?: { result?: GraphqlTweetResult };
          threaded_conversation_with_injections_v2?: {
            instructions?: Array<{
              entries?: Array<{
                content?: {
                  itemContent?: {
                    tweet_results?: {
                      result?: GraphqlTweetResult;
                    };
                  };
                };
              }>;
            }>;
          };
        };
      }
    | { success: false; error: string }
  > {
    const variables = {
      focalTweetId: tweetId,
      with_rux_injections: false,
      rankingMode: 'Relevance',
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
    };

    const features = {
      ...this.buildTweetDetailFeatures(),
      articles_preview_enabled: true,
      articles_rest_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
    };

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
    });

    try {
      const parseResponse = async (response: Response) => {
        if (!response.ok) {
          const text = await response.text();
          return { success: false as const, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          data?: {
            tweetResult?: { result?: GraphqlTweetResult };
            threaded_conversation_with_injections_v2?: {
              instructions?: Array<{
                entries?: Array<{
                  content?: {
                    itemContent?: {
                      tweet_results?: {
                        result?: GraphqlTweetResult;
                      };
                    };
                  };
                }>;
              }>;
            };
          };
          errors?: Array<{ message: string; code?: number }>;
        };

        if (data.errors && data.errors.length > 0) {
          return { success: false as const, error: data.errors.map((e) => e.message).join(', ') };
        }

        return { success: true as const, data: data.data ?? {} };
      };

      let lastError: string | undefined;

      for (const queryId of TWEET_DETAIL_QUERY_IDS) {
        const url = `${TWITTER_API_BASE}/${queryId}/TweetDetail?${params}`;
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (response.status !== 404) {
          return await parseResponse(response);
        }

        const postResponse = await this.fetchWithTimeout(`${TWITTER_API_BASE}/${queryId}/TweetDetail`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ variables, features, queryId }),
        });

        if (postResponse.status !== 404) {
          return await parseResponse(postResponse);
        }

        lastError = 'HTTP 404';
      }

      return { success: false, error: lastError ?? 'Unknown error fetching tweet detail' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get tweet details by ID
   */
  async getTweet(tweetId: string): Promise<GetTweetResult> {
    const response = await this.fetchTweetDetail(tweetId);
    if (!response.success) {
      return response;
    }

    const tweetResult =
      (response.data.tweetResult as { result?: GraphqlTweetResult } | undefined)?.result ??
      this.findTweetInInstructions(
        response.data.threaded_conversation_with_injections_v2?.instructions as
          | Array<{
              entries?: Array<{
                content?: {
                  itemContent?: {
                    tweet_results?: {
                      result?: GraphqlTweetResult;
                    };
                  };
                };
              }>;
            }>
          | undefined,
        tweetId,
      );

    const mapped = this.mapTweetResult(tweetResult);
    if (mapped) {
      if (tweetResult?.article) {
        const title = this.firstText(tweetResult.article.article_results?.result?.title, tweetResult.article.title);
        const articleText = this.extractArticleText(tweetResult);
        if (title && (!articleText || articleText.trim() === title.trim())) {
          const userId = tweetResult.core?.user_results?.result?.rest_id;
          if (userId) {
            const fallback = await this.fetchUserArticlePlainText(userId, tweetId);
            if (fallback.plainText) {
              mapped.text = fallback.title ? `${fallback.title}\n\n${fallback.plainText}` : fallback.plainText;
            }
          }
        }
      }
      return { success: true, tweet: mapped };
    }
    return { success: false, error: 'Tweet not found in response' };
  }

  /**
   * Post a new tweet
   */
  async tweet(text: string): Promise<TweetResult> {
    const variables = {
      tweet_text: text,
      dark_request: false,
      media: {
        media_entities: [],
        possibly_sensitive: false,
      },
      semantic_annotation_ids: [],
    };

    const features = {
      rweb_video_screen_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      articles_preview_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    };

    return this.createTweet(variables, features);
  }

  /**
   * Reply to an existing tweet
   */
  async reply(text: string, replyToTweetId: string): Promise<TweetResult> {
    const variables = {
      tweet_text: text,
      reply: {
        in_reply_to_tweet_id: replyToTweetId,
        exclude_reply_user_ids: [],
      },
      dark_request: false,
      media: {
        media_entities: [],
        possibly_sensitive: false,
      },
      semantic_annotation_ids: [],
    };

    const features = {
      rweb_video_screen_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      articles_preview_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    };

    return this.createTweet(variables, features);
  }

  private async createTweet(
    variables: Record<string, unknown>,
    features: Record<string, boolean>,
  ): Promise<TweetResult> {
    const queryId = QUERY_IDS.CreateTweet;
    const urlWithOperation = `${TWITTER_API_BASE}/${queryId}/CreateTweet`;

    const body = JSON.stringify({ variables, features, queryId });

    try {
      const response = await this.fetchWithTimeout(urlWithOperation, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
      });

      // Twitter increasingly prefers POST to /i/api/graphql with queryId in the payload.
      // If the operation URL 404s, retry the generic endpoint.
      if (response.status === 404) {
        const retry = await this.fetchWithTimeout(TWITTER_GRAPHQL_POST_URL, {
          method: 'POST',
          headers: this.getHeaders(),
          body,
        });

        if (!retry.ok) {
          const text = await retry.text();
          return { success: false, error: `HTTP ${retry.status}: ${text.slice(0, 200)}` };
        }

        const data = (await retry.json()) as CreateTweetResponse;

        if (data.errors && data.errors.length > 0) {
          return { success: false, error: data.errors.map((e) => e.message).join(', ') };
        }

        const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
        if (tweetId) return { success: true, tweetId };

        return { success: false, error: 'Tweet created but no ID returned' };
      }

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as CreateTweetResponse;

      if (data.errors && data.errors.length > 0) {
        return {
          success: false,
          error: data.errors.map((e) => e.message).join(', '),
        };
      }

      const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
      if (tweetId) {
        return {
          success: true,
          tweetId,
        };
      }

      return {
        success: false,
        error: 'Tweet created but no ID returned',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search for tweets matching a query
   */
  async search(query: string, count = 20): Promise<SearchResult> {
    const variables = {
      rawQuery: query,
      count,
      querySource: 'typed_query',
      product: 'Latest',
    };

    const features = this.buildSearchFeatures();

    let lastError: string | undefined;

    for (const queryId of SEARCH_TIMELINE_QUERY_IDS) {
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
      });
      const url = `${TWITTER_API_BASE}/${queryId}/SearchTimeline?${params}`;

      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ features, queryId }),
        });

        if (response.status === 404) {
          lastError = `HTTP ${response.status}`;
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          data?: {
            search_by_raw_query?: {
              search_timeline?: {
                timeline?: {
                  instructions?: Array<{
                    entries?: Array<{
                      content?: {
                        itemContent?: {
                          tweet_results?: {
                            result?: {
                              rest_id?: string;
                              legacy?: {
                                full_text?: string;
                                created_at?: string;
                                reply_count?: number;
                                retweet_count?: number;
                                favorite_count?: number;
                                in_reply_to_status_id_str?: string;
                              };
                              core?: {
                                user_results?: {
                                  result?: {
                                    legacy?: {
                                      screen_name?: string;
                                      name?: string;
                                    };
                                  };
                                };
                              };
                            };
                          };
                        };
                      };
                    }>;
                  }>;
                };
              };
            };
          };
          errors?: Array<{ message: string }>;
        };

        if (data.errors && data.errors.length > 0) {
          return { success: false, error: data.errors.map((e) => e.message).join(', ') };
        }

        const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
        const tweets = this.parseTweetsFromInstructions(instructions);

        return { success: true, tweets };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return { success: false, error: lastError ?? 'Unknown error fetching search results' };
  }

  /**
   * Fetch the account associated with the current cookies
   */
  async getCurrentUser(): Promise<CurrentUserResult> {
    const candidateUrls = [
      'https://x.com/i/api/account/settings.json',
      'https://api.twitter.com/1.1/account/settings.json',
      'https://x.com/i/api/account/verify_credentials.json?skip_status=true&include_entities=false',
      'https://api.twitter.com/1.1/account/verify_credentials.json?skip_status=true&include_entities=false',
    ];

    let lastError: string | undefined;

    for (const url of candidateUrls) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          const text = await response.text();
          lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
          continue;
        }

        // biome-ignore lint/suspicious/noExplicitAny: Twitter API response is dynamic here
        let data: any;
        try {
          data = await response.json();
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          continue;
        }

        const username =
          typeof data?.screen_name === 'string'
            ? data.screen_name
            : typeof data?.user?.screen_name === 'string'
              ? data.user.screen_name
              : null;

        const name =
          typeof data?.name === 'string'
            ? data.name
            : typeof data?.user?.name === 'string'
              ? data.user.name
              : (username ?? '');

        const userId =
          typeof data?.user_id === 'string'
            ? data.user_id
            : typeof data?.user_id_str === 'string'
              ? data.user_id_str
              : typeof data?.user?.id_str === 'string'
                ? data.user.id_str
                : typeof data?.user?.id === 'string'
                  ? data.user.id
                  : null;

        if (username && userId) {
          return {
            success: true,
            user: {
              id: userId,
              username,
              name: name || username,
            },
          };
        }

        lastError = 'Could not determine current user from response';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    // Fallback: scrape the authenticated settings page (HTML) for screen_name/user_id
    const profilePages = ['https://x.com/settings/account', 'https://twitter.com/settings/account'];
    for (const page of profilePages) {
      try {
        const response = await this.fetchWithTimeout(page, {
          headers: {
            cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
            'user-agent': this.userAgent,
          },
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status} (settings page)`;
          continue;
        }

        const html = await response.text();
        const usernameMatch = html.match(/"screen_name":"([^"]+)"/);
        const idMatch = html.match(/"user_id"\s*:\s*"(\d+)"/);
        const nameMatch = html.match(/"name":"([^"\\]*(?:\\.[^"\\]*)*)"/);

        const username = usernameMatch?.[1];
        const userId = idMatch?.[1];
        const name = nameMatch?.[1]?.replace(/\\"/g, '"');

        if (username && userId) {
          return {
            success: true,
            user: {
              id: userId,
              username,
              name: name || username,
            },
          };
        }

        lastError = 'Could not parse settings page for user info';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      success: false,
      error: lastError ?? 'Unknown error fetching current user',
    };
  }

  /**
   * Get replies to a tweet by ID
   */
  async getReplies(tweetId: string): Promise<SearchResult> {
    const response = await this.fetchTweetDetail(tweetId);
    if (!response.success) return response;

    const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
    const tweets = this.parseTweetsFromInstructions(instructions);
    const replies = tweets.filter((tweet) => tweet.inReplyToStatusId === tweetId);

    return { success: true, tweets: replies };
  }

  /**
   * Get full conversation thread for a tweet ID
   */
  async getThread(tweetId: string): Promise<SearchResult> {
    const response = await this.fetchTweetDetail(tweetId);
    if (!response.success) return response;

    const instructions = response.data.threaded_conversation_with_injections_v2?.instructions;
    const tweets = this.parseTweetsFromInstructions(instructions);

    const target = tweets.find((t) => t.id === tweetId);
    const rootId = target?.conversationId || tweetId;
    const thread = tweets.filter((tweet) => tweet.conversationId === rootId);

    thread.sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return aTime - bTime;
    });

    return { success: true, tweets: thread };
  }
}
