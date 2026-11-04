import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { handle as before } from './before.mjs';
import { handle as after } from './after.mjs';

const HANDLERS = { before, after };

// 포트 0이면 빈 포트를 잡습니다. logFile을 주면 요청을 JSON 한 줄씩 남깁니다.
export function startSite(kind, { port = 0, logFile } = {}) {
  const handler = HANDLERS[kind];
  if (!handler) throw new Error(`unknown site: ${kind}`);
  return new Promise((resolve) => {
    let origin = '';
    const server = http.createServer((req, res) => {
      const out = handler(req, origin);
      if (logFile) {
        appendFileSync(logFile, JSON.stringify({
          site: kind,
          path: req.url,
          status: out.status,
          ua: req.headers['user-agent'] ?? '',
          referer: req.headers.referer ?? '',
        }) + '\n');
      }
      res.writeHead(out.status, { 'content-type': out.type });
      res.end(out.body);
    });
    server.listen(port, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve({ origin, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = await startSite('before', { port: 4101 });
  const b = await startSite('after', { port: 4102 });
  console.log(`before ${a.origin}\nafter  ${b.origin}`);
}
