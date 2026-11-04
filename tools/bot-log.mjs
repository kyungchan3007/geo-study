#!/usr/bin/env node
// 접근 로그(JSON 한 줄씩: path, status, ua, referer)를 AI 관점으로 집계합니다.
import { readFileSync } from 'node:fs';
import { aiReferrer, classifyUa } from './bots.mjs';

export function summarize(lines) {
  const bots = {};
  const referrals = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    const bot = classifyUa(e.ua);
    if (bot) {
      const row = (bots[bot.name] ??= { kind: bot.kind, requests: 0, errors: 0 });
      row.requests += 1;
      if (e.status >= 400) row.errors += 1;
    }
    const ref = aiReferrer(e.referer);
    if (ref) referrals[ref] = (referrals[ref] ?? 0) + 1;
  }
  return { bots, referrals };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용: node tools/bot-log.mjs <로그 파일>');
    process.exit(2);
  }
  const { bots, referrals } = summarize(readFileSync(file, 'utf8').split('\n'));
  console.table(bots);
  console.log('AI 서비스에서 온 유입', referrals);
}
