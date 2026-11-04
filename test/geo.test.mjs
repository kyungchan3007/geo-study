import test from 'node:test';
import assert from 'node:assert/strict';
import { startSite } from '../sites/server.mjs';
import { audit, jsonLdIssues, parsePage, requiredPassed } from '../tools/geo-check.mjs';
import { isAllowed } from '../tools/robots.mjs';
import { aiReferrer, classifyUa } from '../tools/bots.mjs';
import { summarize } from '../tools/bot-log.mjs';
import { parseRun } from '../tools/citation-probe.mjs';
import { judge } from '../sites/data.mjs';

const PATHS = ['/', '/rates/JPY', '/rates/USD', '/method'];
const failed = (results) => results.filter((r) => r.ok === false).map((r) => r.name);

test('before 사이트는 접근 · 렌더링 · 정체성 필수 항목에서 실패한다', async () => {
  const site = await startSite('before');
  const results = await audit(site.origin, ['/', '/rates/JPY'], { expect: { '/rates/JPY': ['850원'] } });
  await site.close();
  assert.equal(requiredPassed(results), false);
  const names = failed(results);
  for (const n of ['robots.txt가 검색 · 조회 봇을 허용', '봇 이름으로 요청해도 200 응답', 'JS 없이 본문 200자 이상', '핵심 사실이 첫 HTML에 포함', '페이지마다 다른 제목', 'canonical이 자기 주소', '사이트맵에 모든 페이지 포함']) {
    assert.ok(names.includes(n), n);
  }
});

test('after 사이트는 필수와 권장 항목을 모두 통과한다', async () => {
  const site = await startSite('after');
  const results = await audit(site.origin, PATHS, { expect: { '/rates/JPY': ['850원', '싼 편'] } });
  await site.close();
  assert.deepEqual(failed(results), []);
});

test('llms.txt 없이도 필수 항목을 통과하고 판정에 영향이 없다', async () => {
  const site = await startSite('after');
  const res = await fetch(`${site.origin}/llms.txt`);
  const results = await audit(site.origin, PATHS);
  await site.close();
  assert.equal(res.status, 404);
  assert.equal(requiredPassed(results), true);
});

test('학습 봇을 막아도 검색 봇은 허용할 수 있다', () => {
  const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n';
  assert.equal(isAllowed(robots, 'GPTBot'), false);
  assert.equal(isAllowed(robots, 'OAI-SearchBot'), true);
});

test('robots.txt는 여러 User-agent 묶음과 긴 경로 우선을 따른다', () => {
  const robots = 'User-agent: A\nUser-agent: B\nDisallow: /x\nAllow: /x/open\n';
  assert.equal(isAllowed(robots, 'B', '/x/closed'), false);
  assert.equal(isAllowed(robots, 'B', '/x/open/1'), true);
  assert.equal(isAllowed(robots, 'C', '/x/closed'), true);
});

test('숫자뿐인 H1과 화면과 다른 JSON-LD를 잡아낸다', () => {
  assert.equal(/[A-Za-z가-힣]{2,}/.test(parsePage('<h1>848.68원 / 100</h1>').h1s[0]), false);
  const ld = (date, shown) => parsePage(`<html><head><script type="application/ld+json">{"dateModified":"${date}"}</script></head><body><p>${shown}</p></body></html>`);
  assert.deepEqual(jsonLdIssues(ld('2026-01-01', '기준일 2026-11-04')), ['날짜 불일치']);
  assert.deepEqual(jsonLdIssues(ld('2026-11-04', '기준일 2026-11-04')), []);
  assert.deepEqual(jsonLdIssues({ jsonLd: ['{broken'], visible: '' }), ['JSON 오류']);
});

test('본문이 빈 페이지는 표 항목을 통과하지 못한다', async () => {
  const site = await startSite('before');
  const results = await audit(site.origin, ['/']);
  await site.close();
  assert.ok(failed(results).includes('표로 값 제공'));
});

test('봇 분류와 AI 유입을 집계한다', () => {
  assert.equal(classifyUa('Mozilla/5.0 (compatible; GPTBot/1.3)').kind, 'training');
  assert.equal(classifyUa('Claude-SearchBot/1.0').kind, 'search');
  assert.equal(classifyUa('Mozilla/5.0 Safari'), null);
  assert.equal(aiReferrer('https://www.perplexity.ai/search'), 'perplexity.ai');
  assert.equal(aiReferrer('https://evilclaude.ai.example.com/'), null);
  const s = summarize([
    JSON.stringify({ ua: 'GPTBot/1.3', status: 403, referer: '' }),
    JSON.stringify({ ua: 'Safari', status: 200, referer: 'https://claude.ai/chat' }),
  ]);
  assert.deepEqual(s.bots.GPTBot, { kind: 'training', requests: 1, errors: 1 });
  assert.equal(s.referrals['claude.ai'], 1);
});

test('인용 측정은 검색하지 않은 응답도 구분해 남긴다', () => {
  const searched = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'q' } }] } }),
    JSON.stringify({ type: 'result', result: '근거 https://www.example.com/a' }),
  ].join('\n');
  const r = parseRun(searched, 'example.com');
  assert.deepEqual([r.searched, r.inAnswer], [true, true]);
  const none = parseRun(JSON.stringify({ type: 'result', result: '모릅니다' }), 'example.com');
  assert.deepEqual([none.searched, none.inAnswer], [false, false]);
});

test('환율 판단은 3% 기준을 따른다', () => {
  assert.equal(judge({ rate: 850, avg90: 880 }).label, '싼 편');
  assert.equal(judge({ rate: 1340, avg90: 1345 }).label, '보통');
  assert.equal(judge({ rate: 1400, avg90: 1345 }).label, '비싼 편');
});
