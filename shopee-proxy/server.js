const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

if (GEMINI_API_KEY) {
    console.log('✅ Chave GEMINI_API_KEY identificada no ambiente.');
} else {
    console.error('❌ GEMINI_API_KEY não encontrada nas variáveis de ambiente!');
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
        service: "Shopee Profit Finder Proxy (HTTP Direto)",
        hasKey: !!GEMINI_API_KEY
    });
});

app.post('/analyze', async (req, res) => {
    const { productTitle, price } = req.body;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Chave de IA não configurada no servidor.' });
    }

    try {
        const prompt = `
        Analise brevemente este produto da Shopee: "${productTitle}" que custa R$ ${price}.
        Gere insights sobre a procura e concorrência para este nicho de mercado.
        Você DEVE responder estritamente no seguinte formato JSON estruturado, sem usar markdown (sem aspas triplas ou a palavra json):
        {
          "demanda": "Alta Demanda",
          "demandaJustificativa": "Produto com excelente volume de buscas e mercado ativo.",
          "vendaRecomendada": ${price || 100},
          "custoMaxFornecedor": ${price ? (parseFloat(price) * 0.55).toFixed(2) : 50},
          "concorrenciaInsight": "Competição moderada para este segmento."
        }
        `;

        // Requisição HTTP direta para a API oficial do Gemini 1.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('Nenhuma resposta retornada da API do Gemini.');
        }

        let responseText = data.candidates[0].content.parts[0].text.trim();
        
        // Limpeza de qualquer marcação Markdown residual
        if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        const analysisResult = JSON.parse(responseText);
        res.json(analysisResult);

    } catch (error) {
        console.error('Erro detalhado:', error);
        res.status(500).json({ error: 'Falha ao processar os dados da análise.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
