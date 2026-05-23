// =================================================================
// Shopee Profit Finder - Proxy Backend v2.6 (Edição Gemini Estável)
// Node.js + Express | Deploy: Railway
// =================================================================

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Segredos via variáveis de ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SHARED_SECRET = process.env.SHARED_SECRET || 'shopee-profit-finder-2025';

// Inicializa o SDK do Gemini
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenerativeAI(GEMINI_API_KEY);
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
        
        Você DEVE responder ESTRITAMENTE em formato JSON usando a seguinte estrutura exata:
        {
          "demanda": "Alta Demanda",
          "demandaJustificativa": "com base nas vendas",
          "vendaRecomendada": ${price},
          "custoMaxFornecedor": ${price ? (parseFloat(price) * 0.5).toFixed(2) : 0},
          "concorrenciaInsight": "Competição moderada para esta categoria."
        }
        
        Retorne APENAS o JSON puro, sem usar markdown (sem blocos com \`\`\`json).
        `;

        // Pega o modelo estável gemini-pro
        const model = ai.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let responseText = response.text().trim();
        
        // Limpeza de segurança caso o modelo insista em colocar tags markdown
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        const analysisResult = JSON.parse(responseText);
        res.json(analysisResult);

    } catch (error) {
        console.error('Erro ao processar análise com Gemini:', error);
        res.status(500).json({ error: 'Falha interna ao processar a inteligência artificial.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
