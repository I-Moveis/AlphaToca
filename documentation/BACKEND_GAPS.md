# Backend Gaps — frente sem back

Gerado depois da Fatia 4. Lista tudo que o frontend **já tem UI implementada** mas que **não funciona ponta-a-ponta** porque o backend AlphaToca atual não expõe o endpoint/claim/payload necessário. Ordem por prioridade (impacto imediato no MVP).

**Convenção:** cada seção traz: **Contexto** (por que precisa), **Shape sugerido** (request/response), **Tela desbloqueada** (arquivo Flutter que espera isso), e **Gravidade**.

---

## 1. `landlordId` / `tenantId` filters em `GET /api/properties/search` — 🔴 alto

### Contexto
Hoje, para montar a tela "Meus imóveis" (tela do locador) e "Moderação" (admin), o frontend baixa a primeira página inteira de `GET /properties/search` e precisaria filtrar client-side por `landlordId`. Problema: **a entidade `Property` devolvida pela API não carrega o campo `landlordId`** no payload de `GET /properties/search` (só na criação/detalhe). Então o frontend hoje exibe **todos os imóveis retornados**, o que só funciona em mock.

### Shape sugerido
```
GET /api/properties/search?landlordId=<uuid>
GET /api/properties/search?tenantId=<uuid>     (visitas/propostas futuras)
```

Resposta: nenhum campo novo, só filtrar o array `data`.

### Tela desbloqueada
- [app/lib/features/listing/presentation/pages/my_properties_page.dart](app/lib/features/listing/presentation/pages/my_properties_page.dart)
- [app/lib/features/admin/presentation/pages/admin_listings_page.dart](app/lib/features/admin/presentation/pages/admin_listings_page.dart)

### Quando isso chegar, o frontend
Troca em [my_properties_notifier.dart](app/lib/features/listing/presentation/providers/my_properties_notifier.dart) — o método `_load(userId)` passa `landlordId: userId` no `SearchFilters` (vai precisar de um campo extra na classe). Remove o TODO. Sem mudanças na UI.

---

## 2. Analytics / métricas de imóvel — 🟠 médio

### Contexto
A tela `listing_analytics_page.dart` hoje mostra **números estaticamente cravados** (142 views, 23 favoritos, 5 propostas, 8 visitas) e tem botões de período (7d / 30d / Total) sem handler. Não existe nada parecido na API.

### Shape sugerido
```
GET /api/properties/:id/analytics?period=7d|30d|total
→ {
    "views": number,
    "favorites": number,
    "proposals": number,
    "visits": number,
    "periodStart": ISO date,
    "periodEnd": ISO date
  }
```

Se o backend já agrega `views` em `Property.views`, o endpoint pode ser derivado de `visits` (table) + um novo `favorites` + um novo `proposals` (veja §5). Um endpoint agregado é o caminho mais rápido para a UI.

### Tela desbloqueada
- [app/lib/features/listing/presentation/pages/listing_analytics_page.dart](app/lib/features/listing/presentation/pages/listing_analytics_page.dart)

### Gravidade
Médio — tela continua abrindo, mas valores são fake. Não quebra fluxo principal.

---

## 3. Favorites / wishlist — 🟠 médio

### Contexto
A tela `favorites_page.dart` existe e tem a UI pronta. Hoje é provavelmente armazenada só em `shared_preferences` (não verifiquei; de qualquer forma, sem endpoint não sincroniza entre devices).

### Shape sugerido
```
GET    /api/favorites              → [Property]
POST   /api/favorites              { propertyId }
DELETE /api/favorites/:propertyId
```

Auth: JWT (qualquer role autenticada). Modelo novo `Favorite(userId, propertyId, createdAt)` com unique constraint em `(userId, propertyId)`.

### Tela desbloqueada
- [app/lib/features/favorites/presentation/pages/favorites_page.dart](app/lib/features/favorites/presentation/pages/favorites_page.dart)
- Botão "coração" em cards de propriedade (espalhado).

### Gravidade
Médio — funciona local, mas sem sync real.

---

## 4. Chat REST endpoints — 🟠 médio

### Contexto
O schema da API tem `ChatSession` e `Message`, mas a documentação (02_MODELS_E_ENUMS.md) deixa claro que hoje o chat é ingerido via **WhatsApp** (há `wamid`, status `delivered/read`, etc). Não há endpoint REST para o frontend criar sessão / enviar mensagem / listar histórico.

### Shape sugerido
```
GET  /api/chats                              → [ChatSession]
GET  /api/chats/:id                          → ChatSession
GET  /api/chats/:id/messages?cursor=...      → [Message] (paginated)
POST /api/chats                              { propertyId } → ChatSession
POST /api/chats/:id/messages                 { content, mediaUrl? } → Message
```

Alternativa: se a API já grava tudo via WhatsApp, expor só `GET` para leitura é suficiente no primeiro momento.

### Tela desbloqueada
- [app/lib/features/chat/presentation/pages/conversations_page.dart](app/lib/features/chat/presentation/pages/conversations_page.dart)
- `chat_page.dart` (tela de mensagens).

### Gravidade
Médio — core de contato entre tenant e landlord. Sem isso, a tela mostra mocks.

---

## 5. Proposals — 🟠 médio

### Contexto
Existe `make_proposal_page.dart` no frontend (botão "Fazer proposta") mas sem endpoint. No schema da API aparecem `RentalProcess` com `AiExtractedInsight` (budget, neighborhood, intent) — pode estar relacionado, mas não é uma "proposta formal" que o tenant faz ao landlord.

### Shape sugerido
```
POST /api/proposals
  { propertyId, offeredRent, moveInDate, message? }
  → Proposal
GET  /api/proposals?tenantId=X
GET  /api/proposals?landlordId=X
PATCH /api/proposals/:id
  { status: ACCEPTED | REJECTED | COUNTERED, counterOffer? }
```

Status enum: `PENDING | ACCEPTED | REJECTED | COUNTERED | EXPIRED | WITHDRAWN`.

### Tela desbloqueada
- [app/lib/features/proposal/presentation/pages/make_proposal_page.dart](app/lib/features/proposal/presentation/pages/make_proposal_page.dart)
- Tela de contrato que decorre da proposta aceita.

### Gravidade
Médio — é um caminho feliz importante (tenant → landlord), mas pode rodar via chat numa v1.

---

## 6. Contracts — 🟡 baixo (MVP)

### Contexto
`admin_contracts_page.dart` hoje tem um banner "Em breve" (fatia 4) — antes mostrava 6 contratos hardcoded. Não existe modelo ou endpoint.

### Shape sugerido
```
GET    /api/contracts                              → [Contract]
GET    /api/contracts/:id
POST   /api/contracts                              { proposalId, effectiveDate, termMonths }
PATCH  /api/contracts/:id                          { status: ACTIVE | PENDING_SIGNATURE | DRAFT | CLOSED }
POST   /api/contracts/:id/documents                multipart: file + type (IDENTITY / INCOME_PROOF / CONTRACT)
```

Contract status = schema `ProcessStatus` (TRIAGE/VISIT_SCHEDULED/CONTRACT_ANALYSIS/CLOSED) não encaixa; precisa um enum novo ou renomear.

### Tela desbloqueada
- [app/lib/features/admin/presentation/pages/admin_contracts_page.dart](app/lib/features/admin/presentation/pages/admin_contracts_page.dart)
- Fluxo de contrato pós-proposta.

### Gravidade
Baixo — v1 do MVP pode fechar contratos por fora da plataforma (PDF manual), o banner "em breve" já cobre expectativa.

---

## 7. Agregados do admin dashboard — 🟡 baixo

### Contexto
`admin_dashboard_page.dart` hoje conta `users.length` e `properties.length` client-side puxando as listas inteiras — frágil quando a base crescer. Ideal ter um endpoint dedicado.

### Shape sugerido
```
GET /api/admin/metrics
  → {
      totalUsers: number,
      totalProperties: number,
      totalContracts: number,       (quando §6 existir)
      pendingModeration: number,    (quando existir aprovação — veja §10)
      usersByRole: { TENANT: n, LANDLORD: n, ADMIN: n },
      propertiesByStatus: { AVAILABLE: n, IN_NEGOTIATION: n, RENTED: n }
    }
```

Auth: ADMIN only.

### Tela desbloqueada
- [app/lib/features/admin/presentation/pages/admin_dashboard_page.dart](app/lib/features/admin/presentation/pages/admin_dashboard_page.dart)

### Gravidade
Baixo — funciona até uns milhares de registros. Só vai incomodar em produção.

---

## 8. Claim de role no JWT — 🟡 verificação

### Contexto
O frontend lê o papel do usuário do custom claim **`https://alphatoca.com/roles`** (array de strings: `LANDLORD`, `ADMIN`, default `TENANT`). Isso está hardcoded em [core/constants.dart `kAuth0RolesClaim`](app/lib/core/constants.dart) e consumido em [auth0_mapper.dart](app/lib/features/auth/data/models/auth0_mapper.dart).

### Ação necessária no backend / dashboard Auth0
Quando o tenant Auth0 for criado, criar uma **Auth0 Action** que insira esse claim no ID token com exatamente esse namespace. Se for outro namespace, avisar o frontend pra editar a constante.

Exemplo da Action (Auth0 → Actions → Flows → Login):
```js
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles || ['TENANT'];
  api.idToken.setCustomClaim('https://alphatoca.com/roles', roles);
  api.accessToken.setCustomClaim('https://alphatoca.com/roles', roles);
};
```

### Gravidade
Verificação — não quebra nada (default é TENANT), mas sem isso ninguém consegue acessar telas admin/landlord.

---

## 9. Auth0 tenant em si (config, não código) — 🔴 alto

### Contexto
Toda a fatia 3 entregou o código de integração, mas **nada roda com API real até um tenant Auth0 ser criado**. Precisa ser configurado no dashboard da Auth0 (fora do escopo do backend, mas bloqueia o backend de validar tokens).

### Ação necessária
1. Criar tenant em https://manage.auth0.com → `<nome>.auth0.com`.
2. Criar **Application** do tipo "Native" → pega `client_id`.
3. Criar **API** com identifier (o `audience`) ex: `https://alphatoca-api`.
4. Adicionar callback URLs: `com.imoveis.app://<domain>/android/com.imoveis.app/callback` (Android) e `com.imoveis.app://<domain>/ios/com.imoveis.app/callback` (iOS). Os URLs batem com o `applicationId` do build.gradle.kts.
5. Action de roles (§8).
6. Passar as 3 vars pro frontend via `--dart-define`:
   ```
   flutter run \
     --dart-define=USE_MOCK_DATA=false \
     --dart-define=AUTH0_DOMAIN=seu-tenant.auth0.com \
     --dart-define=AUTH0_CLIENT_ID=xxxxxxxx \
     --dart-define=AUTH0_AUDIENCE=https://alphatoca-api
   ```
7. Preencher `app/android/gradle.properties` com `auth0Domain=seu-tenant.auth0.com` (para o intent-filter).
8. No backend: configurar `AUTH0_ISSUER_BASE_URL` e `AUTH0_AUDIENCE` pra bater com os mesmos valores.

### Tela desbloqueada
Tudo que exige JWT: Visits (todas), Users/me, Admin Users CRUD.

---

## 10. Moderação de anúncios (approve/reject) — 🟡 baixo

### Contexto
`admin_listings_page.dart` tinha botões "✓ aprovar" e "✗ rejeitar" (removidos na fatia 4 porque não havia onde batir). Se o produto quiser moderação antes do imóvel aparecer na busca, vai precisar de um status novo e endpoints.

### Shape sugerido
```
PUT /api/properties/:id/moderation
  { decision: 'APPROVED' | 'REJECTED', reason?: string }
```

Ou adicionar `moderationStatus: PENDING | APPROVED | REJECTED` em Property e usar o PUT existente. Filtrar `GET /properties/search` por `moderationStatus=APPROVED` default (e `?includePending=true` pra admin).

### Tela desbloqueada
- [app/lib/features/admin/presentation/pages/admin_listings_page.dart](app/lib/features/admin/presentation/pages/admin_listings_page.dart) — botões podem voltar.

### Gravidade
Baixo — produto pode rodar sem moderação prévia no MVP.

---

## 11. Upload de imagens de Property — 🟠 médio

### Contexto
Propriedades têm `images: [{url, isCover, caption}]`, mas **não há endpoint para enviar arquivos**. O frontend hoje assume que URLs já existem (S3/Cloudinary). O create listing da fatia 4 **não envia fotos** porque não há onde.

### Shape sugerido
```
POST /api/properties/:id/images          multipart: file + isCover? + caption?
DELETE /api/properties/:id/images/:imageId
PUT /api/properties/:id/images/:imageId  { isCover, caption }
```

Servidor faz upload pro storage (S3/etc) e salva a URL. Alternativa: o frontend faz upload direto pra S3 com presigned URL — `POST /api/properties/:id/images/presign → {uploadUrl, fields}`, e depois `POST /api/properties/:id/images {url, ...}`.

### Tela desbloqueada
- [create_listing_page.dart](app/lib/features/listing/presentation/pages/create_listing_page.dart) — seção "Fotos" não existe ainda; será adicionada quando endpoint estiver pronto.

### Gravidade
Médio — sem isso, só dá pra criar listagens "textuais" (sem foto), o que é aceitável em dev/demo mas não em prod.

---

## 12. Refresh token automático no interceptor — 🟡 (dependência: §9)

### Contexto
O `AuthInterceptor` do frontend hoje limpa tokens em 401. O `auth0_flutter.CredentialsManager.credentials()` já refresca automaticamente quando você lê, então **quando Auth0 real estiver ativo**, basta o interceptor chamar `ref.read(auth0Provider)!.credentialsManager.credentials()` antes de um retry em 401.

### Ação necessária
Quando Auth0 subir, adicionar um retry one-time no interceptor. Não precisa de endpoint novo, mas a decisão depende de §9 estar pronto.

### Tela desbloqueada
Todas que pegam 401 por token expirado — hoje jogam pro login, o que é brusco.

### Gravidade
Baixo — UX ruim, mas funciona (usuário refaz login).

---

## 13. Sync `/users/me` no register flow do Auth0 — ✅ já feito no frontend

O frontend já chama `GET /api/users/me` depois de cada login/register/social (fatia 4 fase A) e reescreve o `userId` no storage com o UUID que o backend devolve. **Nada a fazer no backend** — só garantir que o endpoint existe (já existe no schema) e que faz upsert do JWT.

---

## Priorização sugerida pra destravar MVP

1. **§9** — tenant Auth0 (sem isso, nada funciona com API real).
2. **§8** — configurar Action de roles (depende de §9).
3. **§1** — filtro `landlordId` (destrava Meus Imóveis real).
4. **§11** — upload de imagens (sem foto, demo fica fraca).
5. **§3** / **§4** (favorites, chat) — features completas.
6. Resto é polimento.

---

_Gerado automaticamente pela fatia 4 do frontend. Se você editou a API depois disso, este doc pode estar desatualizado — verifique em `01_VISAO_GERAL_API.md` se o endpoint listado aqui já foi adicionado._
