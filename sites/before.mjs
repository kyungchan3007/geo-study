// 흔히 볼 수 있는 "AI에게 안 보이는" 사이트입니다.
// 브라우저에서는 멀쩡하지만 크롤러에게는 세 겹으로 막혀 있습니다.
import { data } from './data.mjs';

const SHELL = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>Home</title></head><body><div id="root"></div>
<script src="/app.js"></script></body></html>`;

const APP_JS = `fetch('/data.json').then(r => r.json()).then(d => {
  const code = location.pathname.split('/')[2];
  const rows = d.rates.filter(r => !code || r.code === code);
  document.getElementById('root').innerHTML = rows
    .map(r => '<h2>' + r.name + ' ' + r.rate + '원</h2>').join('');
});`;

const ROBOTS = `User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
Disallow: /

User-agent: *
Allow: /
`;

// CDN · WAF의 "봇 차단" 설정을 흉내 냅니다.
const WAF_BLOCK = /bot|chatgpt-user|claude-user|perplexity/i;

export function handle(req) {
  const path = new URL(req.url, 'http://x').pathname;
  if (WAF_BLOCK.test(req.headers['user-agent'] ?? '')) {
    return { status: 403, type: 'text/plain', body: 'blocked' };
  }
  if (path === '/robots.txt') return { status: 200, type: 'text/plain', body: ROBOTS };
  if (path === '/app.js') return { status: 200, type: 'text/javascript', body: APP_JS };
  if (path === '/data.json') return { status: 200, type: 'application/json', body: JSON.stringify(data) };
  if (path === '/sitemap.xml' || path === '/llms.txt') return { status: 404, type: 'text/plain', body: 'not found' };
  return { status: 200, type: 'text/html; charset=utf-8', body: SHELL }; // SPA 대체 응답
}
