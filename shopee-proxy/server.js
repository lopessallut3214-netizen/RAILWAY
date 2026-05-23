// =================================================================
// Shopee Profit Finder - Proxy Backend v2.5 (Edição Gemini Free)
// Node.js + Express | Deploy: Railway
// =================================================================

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Segredos via variáveis de ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SHARED_SECRET = process.env.SHARED_SECRET || 'shopee-profit-finder-2025';

// Inicializa o SDK do Gemini
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log('✅ SDK do Gemini inicializado com sucesso.');
} else {
    console.error('❌ GEMINI_API_KEY não definida nas variáveis de ambiente!');
}

// Middlewares
app.use(express.json({ limit: '20kb' }));
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || /^chrome-extension:\/\//.test(origin) || /^http:\/\/localhost/.test(origin)) {
            return cb(null, true);
        }
        cb(new Error('CORS bloqueado: ' + origin));
    },
    methods: ['GET', 'POST']
}));

// Rota de Health Check para testar no navegador
app.get('/health', (req, res) => {
    res.json({
        status: "ok",
        service: "Shopee Profit Finder Proxy (Gemini)",
        hasKey: !!GEMINI_API_KEY,
        uptime: `${process.uptime().toFixed(0)}s`
    });
});

// Rota principal que recebe os dados da extensão
app.post('/analyze', async (req, res) => {
    const { secret, productTitle, price, stock, sales, category, description } = req.body;

    // Validação de segurança básica
    if (secret !== SHARED_SECRET) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    if (!ai) {
        return res.status(500).json({ error: 'Serviço de IA não configurado no servidor.' });
    }

    try {
        const prompt = `
        Atue como um analista especialista em e-commerce e Mercado Livre/Shopee brasileiro.
        Analise o seguinte produto e forneça insights precisos de precificação e concorrência:
        
        Produto: ${productTitle}
        Preço Atual: R$ ${price}
        Estoque: ${stock}
        Vendas Recentes: ${sales}
        Categoria: ${category}
        Descrição/Detalhes: ${description || 'Não informada'}
        
        Você DEVE responder ESTRITAMENTE em formato JSON (sem markdown, sem blocos de texto, apenas o objeto puro), usando a seguinte estrutura exata:
        {
          "demanda": "Alta Demanda" ou "Média Demanda" ou "Baixa Demanda",
          "demandaJustificativa": "uma frase curta explicando o porquê com base nas vendas",
          "vendaRecomendada": num_preco_sugerido,
          "custoMaxFornecedor": num_custo_maximo,
          "concorrenciaInsight": "uma frase curta sobre o nível de competição e posicionamento de preço"
        }
        `;

        // Chama o modelo gemini-2.5-flash (rápido e econômico/gratuito)
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Força o modelo a devolver o output estritamente em JSON estruturado
                responseMimeType: 'application/json'
            }
        });

        const responseText = response.text;
        
        // Converte a resposta em objeto e envia de volta para a extensão
        const analysisResult = JSON.parse(responseText);
        res.json(analysisResult);

    } catch (error) {
        console.error('Erro ao processar análise com Gemini:', error);
        res.status(500).json({ error: 'Falha interna ao processar a inteligência artificial.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
});
