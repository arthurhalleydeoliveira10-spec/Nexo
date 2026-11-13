// DJ Nexo — procura músicas no YouTube pelo nome (chave YOUTUBE_API_KEY no Netlify)
// e transforma links do Spotify no nome da música para tocar pelo YouTube.
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function spotifyName(url) {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const r = await fetch('https://open.spotify.com/track/' + m[1], { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'pt-BR,pt;q=0.9' } });
  const h = await r.text();
  const title = decode((h.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '');
  const desc = decode((h.match(/<meta property="og:description" content="([^"]+)"/) || [])[1] || '');
  // a descrição vem como "Artista · Álbum · Música · Ano"
  const artist = desc.split('·')[0]?.trim();
  if (!title) return null;
  return artist && artist !== title ? `${title} ${artist}` : title;
}

export default async (req) => {
  const key = process.env.YOUTUBE_API_KEY;
  const u = new URL(req.url);
  if (u.searchParams.has('ping')) return json({ ok: true, configured: !!key });
  let q = (u.searchParams.get('q') || '').slice(0, 200).trim();
  const sp = u.searchParams.get('spotify');
  let from = null;
  try {
    if (sp) { const n = await spotifyName(sp); if (!n) return json({ error: 'Não consegui ler esse link do Spotify. Mande o link de uma música (track).' }, 400); q = n; from = n; }
    if (!q) return json({ error: 'Diga o nome da música' }, 400);
    if (!key) return json({ error: 'A busca por nome ainda não foi configurada no Netlify.', query: q }, 503);
    const api = new URL('https://www.googleapis.com/youtube/v3/search');
    api.search = new URLSearchParams({ part: 'snippet', q, type: 'video', maxResults: '5', videoEmbeddable: 'true', regionCode: 'BR', key });
    const r = await fetch(api); const j = await r.json();
    if (!r.ok) return json({ error: j?.error?.message || 'O YouTube não respondeu' }, 502);
    const items = (j.items || []).map(it => ({ vid: it.id.videoId, title: decode(it.snippet.title), channel: decode(it.snippet.channelTitle) }));
    if (!items.length) return json({ error: 'Não achei essa música no YouTube.' }, 404);
    return json({ query: q, from, results: items });
  } catch (e) {
    return json({ error: 'Não consegui procurar agora.' }, 502);
  }
};
