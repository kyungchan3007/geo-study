// 같은 데이터로 만든 두 사이트를 크롤러 입장에서 비교합니다.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSite } from '../sites/server.mjs';
import { audit, format } from '../tools/geo-check.mjs';
import { summarize } from '../tools/bot-log.mjs';

const logFile = join(mkdtempSync(join(tmpdir(), 'geo-study-')), 'access.jsonl');
const paths = ['/', '/rates/JPY', '/rates/USD'];
const expect = { '/rates/JPY': ['850원', '싼 편'] };

for (const kind of ['before', 'after']) {
  const site = await startSite(kind, { logFile });
  const sitePaths = kind === 'after' ? [...paths, '/method'] : paths;

  console.log(`\n===== ${kind}: curl로 본 엔화 페이지 앞부분 =====`);
  const raw = await (await fetch(`${site.origin}/rates/JPY`)).text();
  console.log(raw.replace(/\s+/g, ' ').slice(0, 300));

  console.log(`\n===== ${kind}: 점검 결과 =====`);
  console.log(format(await audit(site.origin, sitePaths, { expect })));

  // 실제 AI 유입이 있다면 로그에 이렇게 남는다고 가정한 예시입니다.
  await fetch(`${site.origin}/`, { headers: { referer: 'https://chatgpt.com/' } });
  await site.close();
}

console.log('\n===== 점검 중 쌓인 로그 집계 =====');
const { bots, referrals } = summarize(readFileSync(logFile, 'utf8').split('\n'));
console.table(bots);
console.log('AI 서비스에서 온 유입', referrals);
