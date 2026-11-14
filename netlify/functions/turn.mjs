// Servidor de apoio para chamadas (TURN) — busca credenciais temporárias na Metered.
// Variáveis no Netlify: METERED_DOMAIN (ex.: nexo.metered.live) e METERED_API_KEY.
const json = (o, status = 200, cache = 'no-store') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const clean = v => (v || '').trim().replace(/^["']|["']$/g, '');

export default async () => {
  let domain = clean(process.env.METERED_DOMAIN).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const key = clean(process.env.METERED_API_KEY);
  if (!domain || !key) return json({ configured: false, iceServers: [] });
  if (!domain.includes('.')) domain += '.metered.live';
  try {
    const r = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`);
    const j = await r.json();
    if (!r.ok || !Array.isArray(j)) return json({ configured: true, error: j?.message || j?.error || 'A Metered não respondeu', iceServers: [] }, 502);
    return json({ configured: true, iceServers: j }, 200, 'private, max-age=3600');
  } catch (e) {
    return json({ configured: true, error: 'Não consegui falar com a Metered', iceServers: [] }, 502);
  }
};
