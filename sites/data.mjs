// 학습용 가상 데이터입니다. 실제 환율이 아닙니다.
export const data = {
  updated: '2026-11-04',
  source: { name: '가상 환율 데이터', url: 'https://example.com/fx-source' },
  rates: [
    { code: 'JPY', name: '엔화', unit: 100, rate: 850, avg90: 880 },
    { code: 'USD', name: '달러', unit: 1, rate: 1340, avg90: 1345 },
  ],
};

// 90일 평균보다 3% 넘게 낮으면 "싼 편", 3% 넘게 높으면 "비싼 편"으로 봅니다.
export function judge({ rate, avg90 }) {
  const diff = ((rate - avg90) / avg90) * 100;
  const label = diff < -3 ? '싼 편' : diff > 3 ? '비싼 편' : '보통';
  return { label, diff: Number(diff.toFixed(1)) };
}
