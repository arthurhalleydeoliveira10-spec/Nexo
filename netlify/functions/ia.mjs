// Nexo IA — guarda a chave da Anthropic no servidor (variável ANTHROPIC_API_KEY no Netlify)
// e responde as perguntas feitas com @IA no chat.
const hits = new Map(); // limite simples por pessoa (melhor esforço)
const LIMIT_HOUR = 25;

function limited(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter(t => now - t < 3600e3);
  if (arr.length >= LIMIT_HOUR) { hits.set(id, arr); return true; }
  arr.push(now); hits.set(id, arr); return false;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') return json({ ok: true, configured: !!key });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!key) return json({ error: 'A IA ainda não foi configurada no Netlify.' }, 503);

  let body; try { body = await req.json(); } catch { return json({ error: 'Pedido inválido' }, 400); }
  const q = String(body.question || '').slice(0, 1500).trim();
  const ctx = String(body.context || '').slice(0, 6000);
  const who = String(body.user || 'Alguém').slice(0, 40);
  const server = String(body.server || '').slice(0, 60), channel = String(body.channel || '').slice(0, 40);
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'x';
  if (!q) return json({ error: 'Pergunta vazia' }, 400);
  if (limited(ip + '|' + String(body.uid || '').slice(0, 40))) return json({ error: 'Muitas perguntas seguidas. Espere um pouco e tente de novo.' }, 429);

  const tz = String(body.tz || 'America/Sao_Paulo').slice(0, 60);
  let agora;
  try { agora = new Date().toLocaleString('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  const system = `Você é a "Nexo IA", assistente dentro do Nexo, um app de chat onde um grupo de amigos adolescentes conversa e joga. Responda em português do Brasil, de forma amigável, divertida e curta (no máximo umas 120 palavras, a não ser que peçam mais). Use markdown simples (**negrito**, listas). Mantenha tudo adequado para adolescentes. O servidor se chama "${server}" e o canal "#${channel}".
Agora é ${agora} (fuso horário de quem perguntou: ${tz}). Use isso para perguntas sobre data e hora.
Você pode pesquisar na internet com a ferramenta de busca. Pesquise quando a pergunta depender de algo atual ou que muda (notícias, placares de jogos, clima, preços, lançamentos, quem ocupa um cargo). Para perguntas simples que você já sabe, responda direto sem pesquisar. Não coloque links longos na resposta; se usar uma fonte, cite só o nome do site.`;
  const user = `${ctx ? `Conversa recente do canal:\n${ctx}\n\n` : ''}${who} perguntou: ${q}`;
  try {
    const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const call = (withSearch) => fetch(base + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.NEXO_AI_MODEL || 'claude-haiku-5-5', max_tokens: 900, system,
        messages: [{ role: 'user', content: user }],
        ...(withSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'BR', timezone: tz } }] } : {})
      })
    });
    let r = await call(true);
    let j = await r.json();
    // se a busca na internet não estiver disponível, responde sem ela
    if (!r.ok && r.status >= 400 && r.status < 500) { r = await call(false); j = await r.json(); }
    if (!r.ok) return json({ error: j?.error?.message || 'A IA não respondeu' }, 502);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').replace(/\n{3,}/g, '\n\n').trim();
    return json({ text: text || '…' });
  } catch (e) {
    return json({ error: 'Não consegui falar com a IA agora.' }, 502);
  }
};
