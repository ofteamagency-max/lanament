const BUTTONS = ['Exclusive Content', 'Chat with Me', 'Latest Posts'];
const kslug   = (s) => s.toLowerCase().replace(/\s+/g, '_');

const getDates = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1 - i));
  return d.toISOString().split('T')[0];
});

const parseZSet = (arr = []) => {
  const out = [];
  for (let i = 0; i < arr.length; i += 2)
    out.push({ label: arr[i], count: parseInt(arr[i + 1]) || 0 });
  return out;
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.query.token !== process.env.DASHBOARD_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  const pipe = async (cmds) => {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    return (await r.json());
  };

  const dates = getDates(7);

  // Main counters
  const mainCmds = [
    ['GET', 'v:total'],
    ['GET', 'c:total'],
    ...dates.map(d => ['GET', `v:${d}`]),
    ...dates.map(d => ['GET', `c:${d}`]),
    ...BUTTONS.map(b => ['GET', `c:${kslug(b)}:total`]),
    ...BUTTONS.flatMap(b => dates.map(d => ['GET', `c:${kslug(b)}:${d}`])),
  ];

  // Enriched data + live
  const now = Date.now();
  const enrichCmds = [
    ['ZREVRANGE', 'geo:visits', '0',  '9',  'WITHSCORES'],
    ['ZREVRANGE', 'sources',    '0',  '9',  'WITHSCORES'],
    ['ZREVRANGE', 'browsers',   '0',  '-1', 'WITHSCORES'],
    ['ZREVRANGE', 'devices',    '0',  '-1', 'WITHSCORES'],
    ['ZREVRANGE', 'os_list',    '0',  '-1', 'WITHSCORES'],
    ['ZREMRANGEBYSCORE', 'live', '0', (now - 60000).toString()],
    ['ZCARD', 'live'],
  ];

  const [mainRaw, enrichRaw] = await Promise.all([pipe(mainCmds), pipe(enrichCmds)]);

  const R = mainRaw.map(d => (d.result != null ? Number(d.result) || 0 : 0));
  let i = 0;
  const visitsTotal = R[i++];
  const clicksTotal = R[i++];
  const visitsByDay = dates.map(() => R[i++]);
  const clicksByDay = dates.map(() => R[i++]);
  const btnTotals   = BUTTONS.map(() => R[i++]);
  const btnByDay    = BUTTONS.map(() => dates.map(() => R[i++]));

  res.json({
    dates,
    visitsTotal,
    clicksTotal,
    liveCount:    enrichRaw[6]?.result || 0,
    ctr:          visitsTotal > 0 ? +((clicksTotal / visitsTotal) * 100).toFixed(1) : 0,
    visitsByDay,
    clicksByDay,
    topCountries: parseZSet(enrichRaw[0]?.result),
    topSources:   parseZSet(enrichRaw[1]?.result),
    browsers:     parseZSet(enrichRaw[2]?.result),
    devices:      parseZSet(enrichRaw[3]?.result),
    osData:       parseZSet(enrichRaw[4]?.result),
    buttons: BUTTONS.map((b, idx) => ({
      label:  b,
      total:  btnTotals[idx],
      byDay:  btnByDay[idx],
      ctr:    visitsTotal > 0 ? +((btnTotals[idx] / visitsTotal) * 100).toFixed(1) : 0,
    })),
  });
};
