function parseUA(ua = '') {
  const u = ua.toLowerCase();
  let browser = 'Other', device = 'Desktop', os = 'Other';
  if (/iphone|ipod/.test(u))              { device = 'Mobile'; os = 'iOS'; }
  else if (/ipad/.test(u))               { device = 'Tablet'; os = 'iOS'; }
  else if (/android.*mobile/.test(u))    { device = 'Mobile'; os = 'Android'; }
  else if (/android/.test(u))            { device = 'Tablet'; os = 'Android'; }
  else if (/windows/.test(u))            { os = 'Windows'; }
  else if (/mac os x/.test(u))           { os = 'macOS'; }
  else if (/linux/.test(u))              { os = 'Linux'; }
  if (/edg\//.test(u))                   browser = 'Edge';
  else if (/opr\/|opera/.test(u))        browser = 'Opera';
  else if (/chrome\//.test(u))           browser = 'Chrome';
  else if (/firefox\//.test(u))          browser = 'Firefox';
  else if (/safari\//.test(u))           browser = 'Safari';
  return { browser, device, os };
}

const kslug = (s) => s.toLowerCase().replace(/\s+/g, '_');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, label, source, session } = req.body || {};
  const today  = new Date().toISOString().split('T')[0];
  const url    = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token  = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Redis not configured' });

  const pipe = (cmds) => fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });

  const country              = (req.headers['x-vercel-ip-country'] || 'XX').toUpperCase().slice(0, 2);
  const { browser, device, os } = parseUA(req.headers['user-agent']);
  const src                  = (source || 'Direct').slice(0, 80);
  const sid                  = (session || '').slice(0, 64);
  const now                  = Date.now();

  try {
    if (type === 'pageview') {
      const cmds = [
        ['INCR',    'v:total'],
        ['INCR',    `v:${today}`],
        ['ZINCRBY', 'geo:visits', '1', country],
        ['ZINCRBY', 'sources',    '1', src],
        ['ZINCRBY', 'browsers',   '1', browser],
        ['ZINCRBY', 'devices',    '1', device],
        ['ZINCRBY', 'os_list',    '1', os],
      ];
      if (sid) {
        cmds.push(['ZADD',             'live', now.toString(), sid]);
        cmds.push(['ZREMRANGEBYSCORE', 'live', '0', (now - 60000).toString()]);
      }
      await pipe(cmds);

    } else if (type === 'ping' && sid) {
      await pipe([
        ['ZADD',             'live', now.toString(), sid],
        ['ZREMRANGEBYSCORE', 'live', '0', (now - 60000).toString()],
      ]);

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
