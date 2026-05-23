const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Puxa a chave limpando qualquer espaço oculto
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

// Libera geral o CORS para evitar bloqueios do navegador
app.use(express.json({ limit: '20kb' }));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
}));

app.get('/health', (req, res) => {
    res.json({
        status: "ok",
        hasKey: !!GEMINI_API_KEY
    });
});

app.post('/analyze', async (req, res) => {
    const { productTitle, price } = req.body;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Chave GEMINI_API_KEY não encontrada no servidor.' });
    }

    try {
        const prompt = `Analise o produto da Shopee: "${productTitle}" custando R$ ${price}.
Gere insights de mercado. Retorne ESTRITAMENTE um JSON puro, sem introduções e sem markdown.
{
  "demanda": "Alta Demanda",
  "demandaJustificativa": "Produto com excelente volume de buscas.",
  "vendaRecomendada": ${price || 100},
  "custoMaxFornecedor": ${price ? (parseFloat(price) * 0.55).toFixed(2) : 50},
  "concorrenciaInsight": "Competição moderada."
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        // 🚨 SE A CHAVE ESTIVER INVÁLIDA, O ERRO APARECE AQUI
        if (!response.ok) {
            const errData = await response.json();
            return res.status(500).json({ 
                error: `Erro da API do Google: ${errData.error?.message || 'Chave inválida ou bloqueada'}` 
            });
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            return res.status(500).json({ error: 'O Google Gemini não enviou resposta.' });
        }

        const responseText = data.candidates[0].content.parts[0].text;
        
        // 🚨 EXTRATOR BLINDADO DE JSON (Pega só o que tá entre { e })
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: 'IA não retornou um formato válido. Tente de novo.' });
        }
        
        const analysisResult = JSON.parse(jsonMatch[0]);
        res.json(analysisResult);

    } catch (error) {
        // 🚨 SE QUEBRAR NO CÓDIGO, MOSTRA O MOTIVO REAL NA TELA
        console.error('Erro no catch:', error);
        res.status(500).json({ error: `Erro no servidor: ${error.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
