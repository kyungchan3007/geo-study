// 학습용 robots.txt 판정기입니다. 경로 접두사만 비교하고 와일드카드는 다루지 않습니다.
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const at = line.indexOf(':');
    if (at < 0) continue;
    const key = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

export function isAllowed(text, bot, path = '/') {
  const groups = parseRobots(text);
  const name = bot.toLowerCase();
  const group =
    groups.find((g) => g.agents.includes(name)) ??
    groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const hits = group.rules
    .filter((r) => path.startsWith(r.path))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return hits.length ? hits[0].allow : true;
}
