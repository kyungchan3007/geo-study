#!/usr/bin/env node
// 질문을 Claude Code에 던져 검색 여부와 인용 도메인을 기록합니다.
// 사용: node tools/citation-probe.mjs <질문 파일> <찾을 도메인> [반복 횟수] [결과 파일]
// 질문 파일은 한 줄에 질문 하나입니다. 구독 로그인일 때만 실행합니다.
import { execFile } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

// 검색하지 않은 응답도 버리지 않고 searched: false로 남깁니다.
export function parseRun(stream, domain) {
  const queries = [];
  let answer = '';
  for (const line of stream.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === 'assistant') {
      for (const c of e.message?.content ?? []) {
        if (c.type === 'tool_use' && c.name === 'WebSearch') queries.push(c.input?.query ?? '');
      }
    }
    if (e.type === 'result') answer = String(e.result ?? '');
  }
  const domains = [...new Set([...answer.matchAll(/https?:\/\/(?:www\.)?([^/\s)\]]+)/g)].map((m) => m[1]))];
  const low = domain.toLowerCase();
  return {
    searched: queries.length > 0,
    queries,
    domains,
    inAnswer: domains.some((d) => d.toLowerCase() === low || d.toLowerCase().endsWith(`.${low}`)),
    inRaw: stream.toLowerCase().includes(low),
  };
}

export async function assertSubscription() {
  const { stdout } = await run('claude', ['auth', 'status']).catch((e) => ({ stdout: e.stdout ?? '' }));
  const status = JSON.parse(stdout);
  if (status.authMethod !== 'claude.ai' || status.subscriptionType !== 'max') {
    throw new Error(`구독 로그인이 아니어서 중단합니다: ${status.authMethod}/${status.subscriptionType}`);
  }
}

async function ask(question) {
  const { stdout } = await run('claude', [
    '-p', `${question} 웹에서 찾아 근거 URL과 함께 답해줘.`,
    '--model', 'claude-sonnet-5-5',
    '--output-format', 'stream-json', '--verbose',
    '--allowedTools', 'WebSearch,WebFetch',
    '--disallowedTools', 'Bash,Edit,Write,Read,Agent',
  ], { timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, domain, repeat = '1', out = 'probe-results.jsonl'] = process.argv.slice(2);
  if (!file || !domain) {
    console.error('사용: node tools/citation-probe.mjs <질문 파일> <찾을 도메인> [반복 횟수] [결과 파일]');
    process.exit(2);
  }
  await assertSubscription();
  const questions = readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  for (const question of questions) {
    for (let i = 1; i <= Number(repeat); i += 1) {
      const row = { question, run: i, domain, ...parseRun(await ask(question), domain) };
      appendFileSync(out, JSON.stringify(row) + '\n');
      console.log(`${row.inAnswer ? 'O' : 'X'} 검색=${row.searched} ${i}회 ${question}`);
    }
  }
}
