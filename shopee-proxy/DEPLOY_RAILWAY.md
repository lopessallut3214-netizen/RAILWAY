# 🚀 Deploy do Proxy no Railway — Passo a Passo

## Por que Railway?
- Deploy em 3 minutos sem configuração de servidor
- HTTPS automático
- Variáveis de ambiente seguras (a chave API nunca vai para o código)
- Plano gratuito suficiente para uso pessoal

---

## 1. Criar conta no Railway
Acesse https://railway.app e entre com sua conta GitHub.

---

## 2. Subir o código para o GitHub

```bash
# Na pasta shopee-proxy:
git init
git add .
git commit -m "Shopee Profit Finder Proxy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/shopee-proxy.git
git push -u origin main
```

---

## 3. Criar projeto no Railway

1. Clique em **"New Project"**
2. Escolha **"Deploy from GitHub repo"**
3. Selecione o repositório `shopee-proxy`
4. Railway detecta automaticamente que é Node.js e faz o deploy

---

## 4. ⚠️ CONFIGURAR AS VARIÁVEIS DE AMBIENTE (OBRIGATÓRIO)

No painel do projeto Railway:
1. Clique na aba **"Variables"**
2. Adicione as variáveis abaixo:

| Variável | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (sua chave nova — gere uma nova no console.anthropic.com) |
| `SHARED_SECRET` | `shopee-profit-finder-2025` |

> ⚠️ **IMPORTANTE:** A chave que foi exposta na conversa precisa ser REVOGADA e substituída por uma nova.
> Acesse console.anthropic.com → API Keys → Delete → Create New Key

---

## 5. Pegar a URL do servidor

Após o deploy, Railway mostra a URL pública:
```
https://shopee-proxy-production-xxxx.up.railway.app
```

---

## 6. Atualizar a extensão com a URL

Abra o arquivo `shopee-extension/background.js` e troque a linha:

```js
// ANTES:
const PROXY_URL = 'https://SEU-PROJETO.up.railway.app';

// DEPOIS (com sua URL real):
const PROXY_URL = 'https://shopee-proxy-production-xxxx.up.railway.app';
```

Depois:
1. Abra `chrome://extensions/`
2. Clique em 🔄 no card da extensão para recarregar

---

## 7. Testar

Acesse a URL de saúde no navegador:
```
https://shopee-proxy-production-xxxx.up.railway.app/health
```

Deve retornar:
```json
{
  "status": "ok",
  "service": "Shopee Profit Finder Proxy",
  "hasKey": true,
  "cache": 0,
  "uptime": "10s"
}
```

---

## ✅ Pronto!

Agora abra qualquer produto na Shopee.
O painel aparece automaticamente e a IA começa a pesquisar em 2-3 segundos.

---

## Arquitetura final

```
[Você no Chrome]
       ↓  abre produto Shopee
[content.js detecta preço + título]
       ↓  chrome.runtime.sendMessage
[background.js (service worker)]
       ↓  fetch POST /analyze com X-Secret
[Servidor Railway (server.js)]
       ↓  ANTHROPIC_API_KEY segura no servidor
[Anthropic API — Claude + Web Search]
       ↓  JSON com análise real
[Painel exibido na Shopee]
```

**A chave API NUNCA sai do servidor.**
