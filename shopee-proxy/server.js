const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ SDK do Gemini inicializado com sucesso.');
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
        Analise brevemente este produto da Shopee: "${productTitle}" que custa R$ ${price}.
        Gere insights realistas sobre a procura e concorrência para este nicho de mercado.
        Você deve responder estritamente no seguinte formato JSON, sem formatação markdown:
        {
          "demanda": "Alta Demanda ou Média Demanda ou Baixa Demanda",
          "demandaJustificativa": "Sua justificativa curta aqui.",
          "vendaRecomendada": ${price || 100},
          "custoMaxFornecedor": ${price ? (parseFloat(price) * 0.55).toFixed(2) : 50},
          "concorrenciaInsight": "Seu insight de concorrência aqui."
        }
        `;

        // Configuração que força o Gemini a responder apenas em formato JSON estruturado
        const model = ai.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text().trim();
        
        console.log("Resposta bruta do Gemini:", responseText);

        const analysisResult = JSON.parse(responseText);
        res.json(analysisResult);

    } catch (error) {
        console.error('Erro detalhado na análise:', error);
        res.status(500).json({ error: 'Falha na inteligência artificial ao gerar resposta.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
