// 용도별 AI 크롤러입니다. 이름과 정책은 자주 바뀌니 각 회사 공식 문서로 다시 확인합니다.
export const BOTS = {
  training: ['GPTBot', 'ClaudeBot', 'Google-Extended'],
  search: ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot'],
  userFetch: ['ChatGPT-User', 'Claude-User', 'Perplexity-User'],
};

export const AI_REFERRERS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com'];

export function classifyUa(ua = '') {
  const low = ua.toLowerCase();
  for (const [kind, names] of Object.entries(BOTS)) {
    const name = names.find((n) => low.includes(n.toLowerCase()));
    if (name) return { kind, name };
  }
  return null;
}

export function aiReferrer(referer = '') {
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '');
    return AI_REFERRERS.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
  } catch {
    return null;
  }
}
