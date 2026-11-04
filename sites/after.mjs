// 같은 데이터를 AI가 읽고 인용할 수 있게 만든 사이트입니다.
// llms.txt 같은 AI 전용 파일은 일부러 넣지 않았습니다.
import { data, judge } from './data.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unitLabel = (r) => (r.unit === 1 ? `1${r.code}` : `${r.unit}${r.code}`);

function page({ origin, path, title, description, body, jsonLd }) {
  const ld = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${origin}${path}">${ld}</head>
<body><nav><a href="/">오늘 환율</a> <a href="/method">판단 기준</a></nav><main>${body}</main></body></html>`;
}

const sourceLine = () =>
  `<p>기준일 <time datetime="${data.updated}">${data.updated}</time> · 출처 <a href="${data.source.url}">${esc(data.source.name)}</a> · 학습용 가상 데이터</p>`;

function home(origin) {
  const rows = data.rates
    .map((r) => {
      const j = judge(r);
      return `<tr><th scope="row"><a href="/rates/${r.code}">${r.name} ${r.code}</a></th><td>${r.rate}원 / ${unitLabel(r)}</td><td>${r.avg90}원</td><td>${j.label}</td></tr>`;
    })
    .join('');
  return page({
    origin,
    path: '/',
    title: '오늘 환율과 90일 평균 비교 · 환율 달력',
    description: `${data.updated} 기준 엔화와 달러 환율을 최근 90일 평균과 비교해 싼 편인지 보여 줍니다.`,
    body: `<h1>오늘 환율, 90일 평균과 비교</h1>
<p>환율 달력은 여행과 해외 결제를 앞둔 사람이 오늘 환율이 최근 90일 평균보다 싼 편인지 확인하는 사이트입니다. 환율을 예측하지 않고, 지난 90일의 평균과 비교한 결과만 알려 줍니다. 판단 기준은 별도 페이지에 공개합니다.</p>
${sourceLine()}
<table><caption>통화별 오늘 환율</caption><thead><tr><th scope="col">통화</th><th scope="col">오늘 환율</th><th scope="col">90일 평균</th><th scope="col">판단</th></tr></thead><tbody>${rows}</tbody></table>`,
  });
}

function rate(origin, r) {
  const j = judge(r);
  const path = `/rates/${r.code}`;
  const sentence = `${data.updated} 기준 ${r.name}(${r.code}) 환율은 ${unitLabel(r)}당 ${r.rate}원입니다. 최근 90일 평균 ${r.avg90}원보다 ${Math.abs(j.diff)}% ${j.diff < 0 ? '낮아' : '높아'} ${j.label}으로 판단합니다.`;
  return page({
    origin,
    path,
    title: `${r.name} ${r.code} 환율 오늘 · 90일 평균 비교 · 환율 달력`,
    description: sentence,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${r.name} ${r.code} 환율`,
      dateModified: data.updated,
      isBasedOn: data.source.url,
    },
    body: `<h1>${r.name} ${r.code} 환율, 오늘은 ${j.label}</h1>
<p>${sentence} 이 판단은 지난 값을 비교한 것이며 앞으로의 환율을 예측하지 않습니다. 실제 환전 금액은 은행 수수료와 우대율에 따라 달라집니다.</p>
${sourceLine()}
<table><caption>${r.name} 환율 요약</caption><tbody>
<tr><th scope="row">오늘 환율</th><td>${r.rate}원 / ${unitLabel(r)}</td></tr>
<tr><th scope="row">90일 평균</th><td>${r.avg90}원</td></tr>
<tr><th scope="row">평균 대비</th><td>${j.diff}%</td></tr></tbody></table>
<p><a href="/method">판단 기준 보기</a></p>`,
  });
}

function method(origin) {
  return page({
    origin,
    path: '/method',
    title: '환율 판단 기준과 데이터 출처 · 환율 달력',
    description: '오늘 환율을 90일 평균과 비교해 싼 편, 보통, 비싼 편으로 나누는 기준과 데이터 출처를 설명합니다.',
    body: `<h1>환율 판단 기준과 데이터 출처</h1>
<p>오늘 환율이 최근 90일 평균보다 3% 넘게 낮으면 싼 편, 3% 넘게 높으면 비싼 편, 그 사이는 보통으로 표시합니다. 이 기준은 과거 값과의 비교일 뿐이며 환율이 앞으로 오르거나 내린다는 뜻이 아닙니다. 환율 자료는 하루에 한 번 갱신합니다.</p>
<table><caption>판단 기준</caption><thead><tr><th scope="col">표시</th><th scope="col">90일 평균 대비</th></tr></thead><tbody>
<tr><th scope="row">싼 편</th><td>3% 넘게 낮음</td></tr>
<tr><th scope="row">보통</th><td>위아래 3% 이내</td></tr>
<tr><th scope="row">비싼 편</th><td>3% 넘게 높음</td></tr></tbody></table>
${sourceLine()}`,
  });
}

const robots = (origin) => `# 예시 정책: 학습 수집은 막고 검색 노출은 허용합니다. 사업 판단에 따라 바꿉니다.
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;

const paths = () => ['/', '/method', ...data.rates.map((r) => `/rates/${r.code}`)];

const sitemap = (origin) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths().map((p) => `<url><loc>${origin}${p}</loc><lastmod>${data.updated}</lastmod></url>`).join('\n')}
</urlset>
`;

export function handle(req, origin) {
  const path = new URL(req.url, 'http://x').pathname;
  const html = (body) => ({ status: 200, type: 'text/html; charset=utf-8', body });
  if (path === '/') return html(home(origin));
  if (path === '/method') return html(method(origin));
  if (path === '/robots.txt') return { status: 200, type: 'text/plain', body: robots(origin) };
  if (path === '/sitemap.xml') return { status: 200, type: 'application/xml', body: sitemap(origin) };
  const found = data.rates.find((r) => path === `/rates/${r.code}`);
  if (found) return html(rate(origin, found));
  return { status: 404, type: 'text/plain', body: 'not found' };
}
