# Protocolo de Sanitização e Segurança — pic-moments
**Modo:** auditoria completa | **Decisão: GO COM RESSALVAS**

## Stack detectada
Express 4 + JavaScript puro (sem TS) + Supabase Storage + Vercel (serverless). Sem banco relacional, sem suíte de testes.

## Resolvido nesta auditoria
| # | Item | Severidade | Ação |
|---|---|---|---|
| 1 | `trust proxy` ausente: rate limit tratava todos os visitantes como 1 IP (bloqueio global no evento) | **CRÍTICA** | `app.set('trust proxy', 1)` |
| 2 | Sem headers de segurança | Alta | CSP, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy (câmera/mic só self) |
| 3 | Login sem proteção de força bruta dedicada | Alta | Limiter 10 tentativas/15min + log de falhas com IP |
| 4 | Comparação de senha vulnerável a timing attack | Média | `crypto.timingSafeEqual` sobre hashes |
| 5 | Doc obsoleta do Google Drive no repo | Baixa | Removida |
| 6 | CSS morto (.ghost-button) | Baixa | Removido |
| 7 | `.env.example` desatualizado (faltavam ADMIN_*, SESSION_SECRET, STORY_MAX) | Baixa | Atualizado com placeholders |
| 8 | Mensagens dinâmicas sem aria-live (a11y) | Baixa | role="status" em upload/login |

## Verificado e já saudável
- Zero segredos no HEAD e no histórico git; `.env` nunca commitado
- `npm audit`: 0 vulnerabilidades (4 deps, todas usadas e mantidas)
- Sem scripts/handlers inline (CSP estrita viável)
- Fronteiras validadas no servidor: tipo MIME, tamanho e quantidade em uploads; sanitização de nome de arquivo (sem path traversal)
- Async com try/catch em todos os handlers; middleware de erro global; sem floating promises relevantes
- Uploads via URLs assinadas de uso único (service key nunca exposta ao cliente)
- Sessão admin: token HMAC-SHA256 com expiração 12h, secret via env
- Cache: mídias imutáveis 1 ano; micro-cache CDN 15s nos GETs públicos
- Sem PII além das mídias enviadas voluntariamente; logs sem dados pessoais

## Ressalvas (débitos aceitos, com dono: SDD da área administrativa)
1. **Sem testes automatizados** — recomendação: smoke test dos endpoints + fluxo de upload no CI antes do evento
2. Token admin em localStorage (XSS-dependente) — migrar para cookie httpOnly no SDD
3. MIME declarado pelo cliente não é verificado por conteúdo (risco baixo: bucket isolado, URLs assinadas)
4. Álbum carrega lista completa de fotos (paginação quando passar de ~500)
5. Sem observabilidade estruturada (só logs da Vercel) — Sentry/afins no SDD
6. Fotos antigas (pré-cache) seguem com max-age=3600
7. Modo `strict`/TS/JSDoc: inexistente — considerar migração gradual se o produto crescer
