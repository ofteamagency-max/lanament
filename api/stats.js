const BUTTONS = ['Exclusive Content', 'Chat with Me', 'Latest Posts'];
const kslug = (s) => s.toLowerCase().replace(/\s+/g, '_');

const getDates = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1 - i));
  return d.toISOString().split('T')[0];
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.query.token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  const pipe = async (cmds) => {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    const data = await r.json();
    return data.map(d => (d.result != null ? Number(d.result) || 0 : 0));
  };

  const dates = getDates(7);

  const cmds = [
    ['GET', 'v:total'],
    ['GET', 'c:total'],
    ...dates.map(d => ['GET', `v:${d}`]),
    ...dates.map(d => ['GET', `c:${d}`]),
    ...BUTTONS.map(b => ['GET', `c:${kslug(b)}:total`]),
    ...BUTTONS.flatMap(b => dates.map(d => ['GET', `c:${kslug(b)}:${d}`])),
  ];

  const R = await pipe(cmds);
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
    ctr: visitsTotal > 0 ? +((clicksTotal / visitsTotal) * 100).toFixed(1) : 0,
    visitsByDay,
    clicksByDay,
    buttons: BUTTONS.map((b, idx) => ({
      label: b,
      total: btnTotals[idx],
      byDay: btnByDay[idx],
      ctr: visitsTotal > 0 ? +((btnTotals[idx] / visitsTotal) * 100).toFixed(1) : 0,
    })),
  });
};
