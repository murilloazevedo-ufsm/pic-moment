# Protocolo rápido (sanitização + performance) — pré-festa
**Modo:** cirúrgico sobre o delta desde a última auditoria. **Decisão: GO**

## Verificado
- npm audit: 0 vulnerabilidades (incluindo a nova dep qrcode)
- Migration da tabela stories aplicada; registro saved:true e listagem com legenda OK
- Sem código morto do refactor dos stories; sem console.log em produção
- Endpoints novos (QR, stories) com validação e rate limit

## Corrigido nesta passada (lente de festa)
1. Páginas HTML sem cache de borda → s-maxage=300 + SWR=600
   (páginas dos convidados agora servidas pelo CDN; função serverless
   quase não é acionada sob pico de acessos; deploy invalida o cache)
2. preconnect ao Supabase nas páginas de envio e álbum
   (handshake TLS antecipado; fotos/vídeos começam a baixar mais cedo)

## Capacidade estimada para o evento
- Upload: direto ao Supabase (não passa pela Vercel) — escala com convidados
- Rate limit: por IP real (trust proxy), HITs de CDN não consomem cota
- Egress Supabase: miniaturas + cache 1 ano nos novos uploads
