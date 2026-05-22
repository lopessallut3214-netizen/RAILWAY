// =============================================================
// Shopee Profit Finder — Proxy Backend v2.0
// Node.js + Express  |  Deploy: Railway
//
// FLUXO SEGURO:
//   Chrome Extension → POST /analyze → Este servidor → Anthropic API
//
// A chave API fica APENAS na variável de ambiente ANTHROPIC_API_KEY
// Nunca exposta ao browser ou ao código da extensão.
// =============================================================

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Segredos via variáveis de ambiente ────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const SHARED_SECRET = process.env.SHARED_SECRET     || 'shopee-profit-finder-2025';

if (!ANTHROPIC_KEY) {
  console.error('❌  ANTHROPIC_API_KEY não definida!');
} else {
  console.log('✅  Chave Anthropic carregada.');
}

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json({ limit: '20kb' }));
app.use(cors({
  origin: (origin, cb) => {
    // Aceita extensões Chrome e localhost (dev)
    if (!origin || /^chrome-extension:\/\//.test(origin) || /^http:\/\/localhost/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS bloqueado: ' + origin));
  },
  methods: ['GET', 'POST'],
}));

// ── Rate limit simples em memória ─────────────────────────────
const rateMap = new Map();
function rateLimitOk(ip) {
  const now   = Date.now();
  const WIN   = 60_000;   // 1 min
  const MAX   = 10;       // 10 req/min por IP
  const entry = rateMap.get(ip) || { n: 0, t: now };
  if (now - entry.t > WIN) { rateMap.set(ip, { n: 1, t: now }); return true; }
  if (entry.n >= MAX) return false;
  entry.n++; rateMap.set(ip, entry); return true;
}

// ── Cache 30 min ──────────────────────────────────────────────
const cache = new Map();
const TTL   = 30 * 60_000;
function getCache(k)    { const e = cache.get(k); if (!e||Date.now()-e.t>TTL){cache.delete(k);return null;} return e.d; }
function setCache(k, d) { cache.set(k, { d, t: Date.now() }); if (cache.size > 300) cache.delete(cache.keys().next().value); }

// ══════════════════════════════════════════════════════════════
// GET /health
// ══════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => res.json({
  status:  'ok',
  service: 'Shopee Profit Finder Proxy',
  hasKey:  !!ANTHROPIC_KEY,
  cache:   cache.size,
  uptime:  Math.floor(process.uptime()) + 's',
}));

// ══════════════════════════════════════════════════════════════
// POST /analyze
// ══════════════════════════════════════════════════════════════
app.post('/analyze', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // 1. Autenticação
  if ((req.headers['x-secret'] || '') !== SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Rate limit
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: 'RateLimit', message: 'Aguarde 1 minuto e tente novamente.' });
  }

  // 3. Validação
  const { titulo, preco, vendas, categoria, loja, pageUrl } = req.body || {};
  if (!titulo || preco === undefined) {
    return res.status(400).json({ error: 'BadRequest', message: 'titulo e preco são obrigatórios.' });
  }

  // 4. Cache
  const cacheKey = String(pageUrl) + '|' + String(preco);
  const hit = getCache(cacheKey);
  if (hit) {
    console.log(`[CACHE HIT] ${titulo.slice(0,45)}`);
    return res.json({ analysis: hit, fromCache: true });
  }

  // 5. Chave presente?
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'NoKey', message: 'Servidor sem chave API.' });
  }

  console.log(`[ANALYZE] "${titulo.slice(0,50)}" | R$${preco} | IP:${ip}`);

  try {
    const analysis = await callAnthropic({ titulo, preco, vendas, categoria, loja, pageUrl });

    // ── Montar campo "enriched" com dados estruturados para o painel ──
    // O content.js chama applyProxyEnrichment(resp.enriched) assim que
    // recebe esta resposta, atualizando demanda e concorrência no painel.
    const enriched = buildEnrichedData(analysis, vendas);

    setCache(cacheKey, analysis);
    res.json({ analysis, enriched });
  } catch (err) {
    console.error('[API ERROR]', err.message);
    res.status(502).json({ error: 'APIError', message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// buildEnrichedData()
// Extrai e padroniza os dados do JSON da IA para o formato
// estruturado que o content.js espera em resp.enriched:
//
//   {
//     "sucesso": true,
//     "vendas_estimadas_mes": 450,
//     "demanda_status": "ALTA",
//     "concorrentes_encontrados": 247
//   }
// ══════════════════════════════════════════════════════════════
function buildEnrichedData(analysis, vendasDom) {
  if (!analysis) return null;

  const enriched = { sucesso: true };

  // 1. Vendas estimadas/mês
  // Prioriza o dado real do DOM (passado pelo content.js no payload)
  // Se não tiver, extrai do campo demanda_real da IA
  const dem = analysis.demanda_real || {};
  if (vendasDom && vendasDom > 0) {
    enriched.vendas_estimadas_mes = vendasDom;
  } else if (dem.volume_estimado_mensal) {
    // Tenta extrair número do texto: "5.000-20.000 unidades/mês" → 12500
    const nums = String(dem.volume_estimado_mensal).match(/[\d.,]+/g);
    if (nums && nums.length >= 2) {
      const a = parseFloat(nums[0].replace(/\./g,'').replace(',','.'));
      const b = parseFloat(nums[1].replace(/\./g,'').replace(',','.'));
      enriched.vendas_estimadas_mes = Math.round((a + b) / 2);
    } else if (nums && nums.length === 1) {
      enriched.vendas_estimadas_mes = parseFloat(nums[0].replace(/\./g,'').replace(',','.'));
    }
  }

  // 2. Status de demanda canônico
  // Mapeado diretamente da tendência da IA para os labels do content.js
  const tendencia = (dem.tendencia || '').toLowerCase();
  const score     = (analysis.oportunidade || {}).score || 0;

  if (tendencia === 'crescendo' && score >= 70)       enriched.demanda_status = 'ALTA';
  else if (tendencia === 'crescendo')                  enriched.demanda_status = 'MEDIA';
  else if (tendencia === 'estavel' && score >= 60)     enriched.demanda_status = 'MEDIA';
  else if (tendencia === 'caindo')                     enriched.demanda_status = 'BAIXA';
  else                                                 enriched.demanda_status = 'MUITO_BAIXA';

  // Override se a IA explicitou nível de concorrência/demanda
  const concNivel = ((analysis.concorrencia || {}).nivel || '').toLowerCase();
  if (concNivel === 'baixa' && enriched.demanda_status !== 'MUITO_BAIXA') {
    // Mercado pouco disputado → demanda provavelmente menor
    // Mantém o status atual mas não eleva
  }

  // 3. Concorrentes encontrados
  // Extrai número do texto retornado pela IA
  const concTexto = (analysis.concorrencia || {}).n_vendedores_estimado || '';
  const concNums  = String(concTexto).match(/[\d.]+/);
  if (concNums) {
    const raw = concNums[0].replace(/\./g, '');
    enriched.concorrentes_encontrados = parseInt(raw) || 0;
  }

  return enriched;
}

// ══════════════════════════════════════════════════════════════
// callAnthropic()
// ══════════════════════════════════════════════════════════════
async function callAnthropic({ titulo, preco, vendas, categoria, loja, pageUrl }) {

  const systemPrompt = `Você é especialista sênior em e-commerce brasileiro e análise de revenda na Shopee.
Missão: analisar um produto da Shopee Brasil com dados REAIS buscados agora na internet.

REGRAS OBRIGATÓRIAS:
- Use web_search no mínimo 4 vezes com buscas específicas e diferentes
- Busque preços reais em: Shopee BR, Mercado Livre, Amazon BR, AliExpress, 1688.com
- Busque tendência e volume de busca no Brasil (Google Trends, relatórios)
- Busque atacadistas e distribuidores brasileiros deste produto
- Use APENAS dados reais encontrados — nunca invente valores
- Responda SOMENTE com o JSON abaixo, sem texto antes/depois, sem markdown, sem backticks

JSON DE RESPOSTA (campos obrigatórios):
{
  "analise_preco": {
    "avaliacao": "caro|justo|barato",
    "preco_minimo_encontrado": 0.00,
    "preco_medio_mercado": 0.00,
    "preco_maximo_encontrado": 0.00,
    "fontes_pesquisadas": ["plataformas reais consultadas"],
    "explicacao": "frase curta e direta baseada nos dados encontrados"
  },
  "demanda_real": {
    "tendencia": "crescendo|estavel|caindo",
    "volume_estimado_mensal": "ex: 5.000-20.000 unidades/mês no Brasil",
    "sazonalidade": "ex: Pico em nov/dez, queda em fev/mar",
    "explicacao": "contexto real de demanda encontrado"
  },
  "concorrencia": {
    "nivel": "muito_alta|alta|media|baixa",
    "n_vendedores_estimado": "ex: +300 vendedores na Shopee BR",
    "principais_plataformas": ["plataformas com mais vendedores"],
    "diferencial_necessario": "o que é necessário para se destacar realmente"
  },
  "fornecimento": {
    "origem_provavel": "China|Brasil|Misto",
    "preco_aliexpress_estimado": 0.00,
    "preco_atacado_br_estimado": 0.00,
    "markup_tipico": "ex: 2x a 4x",
    "fornecedores_sugeridos": ["nomes reais de plataformas/fornecedores"]
  },
  "oportunidade": {
    "score": 0,
    "classificacao": "Excelente|Boa|Regular|Ruim",
    "pontos_positivos": ["max 3 pontos concretos e curtos"],
    "pontos_negativos": ["max 3 riscos concretos e curtos"],
    "recomendacao_final": "recomendação objetiva de 1-2 frases baseada nos dados reais"
  },
  "insights_extras": "um insight valioso e único para o revendedor (max 120 chars)"
}`;

  const userPrompt = `Analise este produto da Shopee Brasil AGORA:

PRODUTO: ${titulo}
PREÇO SHOPEE: R$ ${Number(preco).toFixed(2)}
VENDAS: ${vendas > 0 ? Number(vendas).toLocaleString('pt-BR') + ' unidades' : 'não informado'}
CATEGORIA: ${categoria || 'não identificada'}
VENDEDOR: ${loja || 'não identificado'}
URL: ${pageUrl || 'N/A'}

Execute estas 4 buscas em sequência:
1. Preço deste produto no Mercado Livre e Amazon BR hoje
2. Preço no AliExpress e 1688.com (custo de importação)
3. Volume e tendência de busca no Brasil (Google Trends)
4. Atacadistas e distribuidores brasileiros deste produto

Retorne APENAS o JSON estruturado com os dados encontrados.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:     systemPrompt,
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Anthropic HTTP ${resp.status}`);
  }

  const body = await resp.json();
  const text = (body.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('')
    .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON não encontrado na resposta da IA');
  return JSON.parse(m[0]);
}

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Proxy rodando em http://localhost:${PORT}`);
  console.log(`📡 /health  — status do servidor`);
  console.log(`🤖 /analyze — endpoint principal\n`);
});
