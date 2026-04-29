# Integração Frontend (Next.js/React) — Pós Feature Freeze

**Data:** 2026-04-29
**Branch de referência:** `feat/admin-metrics-moderation`
**Contexto:** backend do AlphaToca entrou em **feature freeze** para o MVP. Os gaps §5 (Proposals), §6 (Contracts), §11 (Upload de imagens) e §12 (Refresh token retry) estão **oficialmente fora de escopo** deste ciclo. §9 (Auth0 tenant) é configuração de dashboard.

Este documento existe para o time de frontend (Next.js) começar a conectar Axios/Fetch imediatamente.

---

## Autenticação (base para todos os endpoints protegidos)

- Todo endpoint protegido exige `Authorization: Bearer <access_token>` (Auth0, algoritmo RS256).
- Vars de ambiente que o backend lê: `AUTH0_AUDIENCE` e `AUTH0_ISSUER_BASE_URL` (este último **deve terminar em `/`**).
- O backend faz upsert do usuário local no primeiro request autenticado. O `req.localUser` é anexado automaticamente.
- Endpoints marcados com 🔒 **ADMIN** exigem que o access token tenha o custom claim `https://alphatoca.com/roles` contendo `"ADMIN"`.
  - Esse claim é injetado pela Action post-login configurada no dashboard Auth0.
  - No SDK `@auth0/nextjs-auth0`, o claim vem em `user['https://alphatoca.com/roles']` como array de strings.

### Formato padrão de erro

Todos os endpoints retornam erro no shape:

```json
{
  "status": 401,
  "code": "UNAUTHORIZED",
  "messages": [{ "message": "Invalid or missing authentication token." }]
}
```

Códigos mais comuns: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400, inclui `path` + `message` por erro).

---

## 🆕 Endpoints novos

### 🔒 ADMIN — Métricas do painel

```
GET /api/admin/metrics
```

**Resposta 200:**
```json
{
  "totals": {
    "users": 42,
    "properties": 128,
    "visits": 67,
    "pendingModeration": 5
  },
  "usersByRole": { "TENANT": 35, "LANDLORD": 6, "ADMIN": 1 },
  "propertiesByStatus": { "AVAILABLE": 110, "IN_NEGOTIATION": 12, "RENTED": 6 },
  "propertiesByModeration": { "APPROVED": 120, "PENDING": 5, "REJECTED": 3 },
  "generatedAt": "2026-04-29T19:42:11.234Z"
}
```

**Erros:** `401` (sem token) · `403` (role ≠ ADMIN).

---

### 🔒 ADMIN — Fila de moderação

```
GET /api/admin/properties?status=PENDING&page=1&limit=20
```

**Query params (todos opcionais):**

| Param | Default | Valores |
|-------|---------|---------|
| `status` | `PENDING` | `PENDING` · `APPROVED` · `REJECTED` |
| `page` | `1` | inteiro ≥ 1 |
| `limit` | `20` | 1 ≤ n ≤ 100 |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Apto 2q Vila Mariana",
      "description": "...",
      "price": "2500.00",
      "status": "AVAILABLE",
      "moderationStatus": "PENDING",
      "moderationReason": null,
      "moderatedAt": null,
      "moderatedBy": null,
      "address": "...",
      "city": "São Paulo",
      "state": "SP",
      "landlord": {
        "id": "uuid",
        "name": "João Silva",
        "phoneNumber": "+5511999990001"
      },
      "images": [{ "id": "uuid", "url": "...", "isCover": true }]
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

Ordenação: `createdAt ASC` (FIFO — mais antigos primeiro).

**Erros:** `401` · `403`.

---

### 🔒 ADMIN — Aprovar ou rejeitar anúncio

```
PUT /api/properties/:id/moderation
```

**Body (aprovar):**
```json
{ "decision": "APPROVED" }
```

**Body (rejeitar):**
```json
{ "decision": "REJECTED", "reason": "Fotos de baixa qualidade" }
```

**Regras de validação (Zod):**
- `decision` é obrigatório; aceita apenas `"APPROVED"` ou `"REJECTED"` (não aceita `"PENDING"`).
- `reason` é obrigatório quando `decision === "REJECTED"`; máximo 500 chars.

**Resposta 200:** objeto `Property` completo com `moderationStatus`, `moderationReason`, `moderatedAt` (ISO), `moderatedBy` (id do admin) preenchidos.

**Erros:** `400` (validação Zod) · `401` · `403` · `404` (property não encontrada).

---

## ⚠️ Endpoints alterados (comportamento mudou)

### `GET /api/properties/search`

**Mudança:** agora filtra automaticamente por `moderationStatus = APPROVED`. Anúncios `PENDING` ou `REJECTED` **não aparecem no search público**, mesmo para usuários autenticados (incluindo admins — admins devem usar `/api/admin/properties`).

**Impacto no seed/demo:**
- A migration marca todos os imóveis **existentes** como `APPROVED` (evita sumir anúncios do banco de demo).
- Imóveis **novos** criados via `POST /api/properties` entram como `PENDING` — só aparecem no search depois de um admin aprovar.

Resto da API de search (filtros, paginação, orderBy, geolocalização) segue idêntica.

---

## Checklist rápido para o Axios/Fetch no Next.js

1. **Base URL por env:**
   - `.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api`
   - Prod: apontar para o host deployado.

2. **Auth:** usar `@auth0/nextjs-auth0` (v3+). Ele gerencia cookie de sessão e refresh automaticamente — não precisa implementar retry manual (diferente do mobile).
   - `getAccessToken({ req, res })` no server-side ou no `/api/auth/[...auth0]` handler.

3. **Interceptor de request:** injetar `Authorization: Bearer <token>` em todo request para `/api/*` exceto `/api/webhook`.

4. **Interceptor de response 401:** redirecionar para `/api/auth/login`. O SDK do Next refresca a sessão via cookie; não precisamos do retry em dois passos que seria necessário no mobile.

5. **Gate de rotas `ADMIN`:**
   ```ts
   // middleware.ts ou page-level
   const session = await getSession();
   const roles = session?.user['https://alphatoca.com/roles'] as string[] | undefined;
   if (!roles?.includes('ADMIN')) redirect('/');
   ```

6. **Tipagem compartilhada:** os schemas Zod em `src/utils/propertyValidation.ts` exportam `CreatePropertyInput`, `UpdatePropertyInput` e `ModeratePropertyInput`. Se o frontend viver em outro pacote/repo, vale re-declarar ou publicar um pacote de tipos.

---

## Pendências que **não bloqueiam** o frontend começar

- **§9 Auth0 tenant** — enquanto o tenant não existir, qualquer endpoint protegido retorna `401`. Frontend pode ser construído com mocks/fixtures enquanto isso.
- **Rodar migration no banco** — `npx prisma migrate deploy` no backend antes de bater nos endpoints de moderação.

---

_Gerado junto com o commit de feature freeze (gaps §7 + §10). Este documento é o contrato final da API backend para o MVP._
