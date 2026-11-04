#!/usr/bin/env node
// 사이트를 "JS를 실행하지 않는 크롤러" 입장에서 점검합니다.
// 사용: node tools/geo-check.mjs https://example.com / /about
import { BOTS } from './bots.mjs';
import { isAllowed } from './robots.mjs';

const REQUIRED = '필수';
const RECOMMENDED = '권장';
const INFO = '참고';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh) geo-study-check';

const get = (url, ua = BROWSER_UA) => fetch(url, { headers: { 'user-agent': ua } });

export function parsePage(html) {
  const first = (re) => (html.match(re) ?? [])[1]?.trim() ?? '';
  const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const body = first(/<body[^>]*>([\s\S]*)<\/body>/i) || html;
  const visible = strip(body.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' '));
  const metaDesc =
    first(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const canonical = first(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]));
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return {
    title: first(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: metaDesc,
    canonical,
    h1s,
    visible,
    jsonLd,
    hasTime: /<time\b[^>]*datetime=/i.test(html),
    hasTable: /<table\b/i.test(html),
    hasSource: /출처|source/i.test(visible),
    linksMethod: /(판단 기준|방법론|about|소개)/i.test(html),
  };
}

export function jsonLdIssues(page) {
  const issues = [];
  for (const raw of page.jsonLd) {
    try {
      const ld = JSON.parse(raw);
      if (ld.dateModified && !page.visible.includes(ld.dateModified)) issues.push('날짜 불일치');
    } catch {
      issues.push('JSON 오류');
    }
  }
  return issues;
}

export async function audit(base, paths = ['/'], { expect = {} } = {}) {
  const origin = base.replace(/\/$/, '');
  const results = [];
  const add = (level, name, ok, detail = '') => results.push({ level, name, ok, detail });

  // 1단계: 접근 — robots.txt와 실제 응답을 따로 봅니다. robots를 열어도 WAF가 막을 수 있습니다.
  const robotsRes = await get(`${origin}/robots.txt`);
  const robotsText = robotsRes.ok ? await robotsRes.text() : '';
  const visibleBots = [...BOTS.search, ...BOTS.userFetch];
  const robotsBlocked = visibleBots.filter((b) => !isAllowed(robotsText, b, '/'));
  add(REQUIRED, 'robots.txt가 검색 · 조회 봇을 허용', robotsBlocked.length === 0, robotsBlocked.join(', '));

  const denied = [];
  for (const bot of visibleBots) {
    const r = await get(`${origin}${paths[0]}`, `Mozilla/5.0 (compatible; ${bot}/1.0)`);
    if (r.status !== 200) denied.push(`${bot}:${r.status}`);
  }
  add(REQUIRED, '봇 이름으로 요청해도 200 응답', denied.length === 0, denied.join(', '));

  // 2 · 3단계: 첫 HTML에 내용이 있는지, 페이지마다 구별되는지
  const pages = {};
  for (const path of paths) {
    const r = await get(`${origin}${path}`);
    pages[path] = { status: r.status, ...parsePage(await r.text()) };
  }
  const failing = (fn) => paths.filter((p) => !fn(pages[p], p));
  const report = (level, name, fn) => {
    const bad = failing(fn);
    add(level, name, bad.length === 0, bad.join(' '));
  };

  report(REQUIRED, '페이지가 200 응답', (p) => p.status === 200);
  report(REQUIRED, 'JS 없이 본문 200자 이상', (p) => p.visible.length >= 200);
  report(REQUIRED, '핵심 사실이 첫 HTML에 포함', (p, path) => (expect[path] ?? []).every((s) => p.visible.includes(s)));
  report(REQUIRED, '내용을 설명하는 제목', (p) => p.title.length >= 10);
  const titles = paths.map((p) => pages[p].title);
  add(REQUIRED, '페이지마다 다른 제목', new Set(titles).size === titles.length, '');
  report(REQUIRED, '설명(meta description) 있음', (p) => p.description.length >= 20);
  report(REQUIRED, 'H1이 하나이고 주제어 포함', (p) => p.h1s.length === 1 && /[A-Za-z가-힣]{2,}/.test(p.h1s[0]));
  report(REQUIRED, 'canonical이 자기 주소', (p, path) => p.canonical === `${origin}${path}`);

  // 4단계: 발견
  const smRes = await get(`${origin}/sitemap.xml`);
  const sm = smRes.ok ? await smRes.text() : '';
  const entries = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const locs = entries.map((e) => (e.match(/<loc>(.*?)<\/loc>/) ?? [])[1]);
  add(REQUIRED, '사이트맵에 모든 페이지 포함', smRes.ok && paths.every((p) => locs.includes(`${origin}${p}`)), smRes.ok ? '' : `HTTP ${smRes.status}`);
  add(RECOMMENDED, '사이트맵에 lastmod', entries.length > 0 && entries.every((e) => /<lastmod>[^<]+<\/lastmod>/.test(e)));

  // 5단계: 인용하기 좋은 내용
  report(RECOMMENDED, '기준일을 time 태그로 표시', (p) => p.hasTime);
  report(RECOMMENDED, '출처 표기', (p) => p.hasSource);
  report(RECOMMENDED, '표로 값 제공', (p) => p.hasTable);
  report(RECOMMENDED, '판단 기준 · 소개로 연결', (p) => p.linksMethod);

  const ldIssues = paths.flatMap((path) => jsonLdIssues(pages[path]).map((issue) => `${path}:${issue}`));
  add(RECOMMENDED, 'JSON-LD를 쓴다면 화면 내용과 일치', ldIssues.length === 0, ldIssues.join(' '));

  // 점수에 넣지 않는 항목
  const blockedTraining = BOTS.training.filter((b) => !isAllowed(robotsText, b, '/'));
  add(INFO, `학습 봇 차단 여부 (사업 판단): ${blockedTraining.join(', ') || '없음'}`, null);
  const llms = await get(`${origin}/llms.txt`);
  add(INFO, `llms.txt ${llms.ok ? '있음' : '없음'} (판정에 반영 안 함)`, null);
  return results;
}

export function format(results) {
  const mark = (r) => (r.ok === null ? '·' : r.ok ? 'O' : 'X');
  const lines = results.map((r) => `${mark(r)} [${r.level}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  const required = results.filter((r) => r.level === REQUIRED);
  const passed = required.filter((r) => r.ok).length;
  lines.push(`필수 ${passed}/${required.length} 통과`);
  return lines.join('\n');
}

export const requiredPassed = (results) => results.filter((r) => r.level === REQUIRED).every((r) => r.ok);

if (import.meta.url === `file://${process.argv[1]}`) {
  const [base, ...paths] = process.argv.slice(2);
  if (!base) {
    console.error('사용: node tools/geo-check.mjs <주소> [경로...]');
    process.exit(2);
  }
  const results = await audit(base, paths.length ? paths : ['/']);
  console.log(format(results));
  process.exit(requiredPassed(results) ? 0 : 1);
}
