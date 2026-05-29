const kslug = (s) => s.toLowerCase().replace(/\s+/g, '_');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, label } = req.body || {};
  const today = new Date().toISOString().split('T')[0];
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Redis not configured' });

  const pipe = (cmds) => fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });

  try {
    if (type === 'pageview') {
      await pipe([['INCR', 'v:total'], ['INCR', `v:${today}`]]);
    } else if (type === 'click' && label) {
      await pipe([
        ['INCR', 'c:total'],
        ['INCR', `c:${today}`],
        ['INCR', `c:${kslug(label)}:total`],
        ['INCR', `c:${kslug(label)}:${today}`],
      ]);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
