const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ SDK do Gemini inicializado com sucesso.');
} else {
    console.error('❌ GEMINI_API_KEY não definida nas variáveis de ambiente!');
}

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

app.get('/health', (req, res) => {
    res.json({
        status: "ok",
        service: "Shopee Profit Finder Proxy (Gemini)",
        hasKey: !!GEMINI_API_KEY
    });
});

app.post('/analyze', async (req, res) => {
    const { productTitle, price } = req.body;

    if (!ai) {
        return res.status(500).json({ error: 'Serviço de IA não configurado no servidor.' });
    }

    try {
        const prompt = `
        Analise brevemente o produto: ${productTitle} com preço R$ ${price}.
        Retorne estritamente um objeto JSON com o formato:
        {
          "demanda": "Média Demanda",
          "demandaJustificativa": "Produto com buscas constantes na plataforma.",
          "vendaRecomendada": ${price || 100},
          "custoMaxFornecedor": ${price ? (parseFloat(price) * 0.6).toFixed(2) : 50},
          "concorrenciaInsight": "Concorrência moderada para este nicho."
        }
        Não inclua markdown (como \`\`\`json). Apenas o JSON puro.
        `;

        const model = ai.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let responseText = response.text().trim();
        
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        const analysisResult = JSON.parse(responseText);
        res.json(analysisResult);

    } catch (error) {
        console.error('Erro na análise:', error);
        res.status(500).json({ error: 'Falha na inteligência artificial.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
