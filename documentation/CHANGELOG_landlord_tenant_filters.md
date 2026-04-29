# Implementação: Filtros `landlordId` / `tenantId` em `GET /api/properties/search`

**Data:** 2026-04-29
**Referência:** [BACKEND_GAPS.md](./BACKEND_GAPS.md) — Item §1 (🔴 Alto)
**Telas desbloqueadas:** `my_properties_page.dart`, `admin_listings_page.dart`

---

## Motivação

O frontend da tela **"Meus Imóveis"** (locador) e da tela de **moderação** (admin) precisavam filtrar
propriedades por proprietário (`landlordId`). O endpoint `GET /api/properties/search` existia, mas
retornava todos os imóveis disponíveis sem suporte a esse filtro, forçando o frontend a baixar a
lista inteira e filtrar no cliente — o que não escala e não funciona com dados reais.

---

## Arquivos Alterados

### 1. `src/utils/searchValidation.ts`

**O que mudou:**
- Removida a dependência de `PropertyType` do `@prisma/client` (que estava inconsistente com o client gerado).
- Adicionado enum local `PropertyType` via `z.enum(...)` como fonte de verdade.
- Adicionados dois novos campos ao `propertySearchSchema`:

```typescript
// Filtros de proprietário/inquilino (§1 BACKEND_GAPS)
landlordId: z.string().uuid().optional(),
tenantId:   z.string().uuid().optional(),
```

**Impacto:** O tipo `PropertySearchInput` (exportado via `z.infer`) agora inclui os dois campos
automaticamente. Qualquer código que use esse tipo recebe os campos sem alteração adicional.

---

### 2. `src/services/propertyService.ts`

**O que mudou:**

#### a) Tipagem unificada — fim da duplicação
A interface `PropertySearchParams` (definida manualmente) foi **substituída por um type alias**
que aponta para `PropertySearchInput`, o tipo inferido diretamente do schema Zod:

```typescript
// Antes: interface manual (risco de divergência com o schema)
export interface PropertySearchParams {
  type?: PropertyType;
  minPrice?: number;
  // ... 18 campos repetidos
}

// Depois: única fonte de verdade
import { PropertySearchInput } from '../utils/searchValidation';
export type PropertySearchParams = PropertySearchInput; // mantido para compatibilidade
```

> **Por que isso é melhor:** Anteriormente existiam dois lugares para definir os mesmos campos.
> Se um filtro fosse adicionado ao schema Zod mas esquecido na interface, o TypeScript não
> reclamaria. Agora o tipo é derivado automaticamente do schema.

#### b) Lógica do filtro `landlordId` — ORM path

Quando `landlordId` é informado, o filtro `status = AVAILABLE` é **removido**, pois o
proprietário deve ver todos os seus imóveis (disponíveis, em negociação e alugados):

```typescript
// Antes: sempre filtrava por AVAILABLE
const where: Prisma.PropertyWhereInput = {
  status: PropertyStatus.AVAILABLE,
  ...
};

// Depois: AVAILABLE só se landlordId não for informado
const where: Prisma.PropertyWhereInput = {
  ...(landlordId ? { landlordId } : { status: PropertyStatus.AVAILABLE }),
  ...
};
```

#### c) Lógica do filtro `tenantId` — ORM path

`tenantId` filtra imóveis nos quais o inquilino possui ao menos uma visita registrada:

```typescript
...(tenantId && {
  visits: { some: { tenantId } }
}),
```

> **Nota:** Quando a entidade `Proposal` for implementada (§5 do BACKEND_GAPS), este filtro
> pode ser expandido para incluir também propostas do inquilino.

#### d) Filtros no caminho raw SQL (geo/proximidade)

Os mesmos filtros foram adicionados ao bloco de `$queryRaw` usado quando `lat`/`lng` estão
presentes, mantendo paridade de comportamento entre os dois caminhos de execução:

```typescript
const landlordFilter = landlordId
  ? Prisma.sql`AND landlord_id = ${landlordId}::uuid`
  : Prisma.empty;

const statusFilter = landlordId
  ? Prisma.empty
  : Prisma.sql`AND status = 'AVAILABLE'`;

const tenantFilter = tenantId
  ? Prisma.sql`AND id IN (SELECT property_id FROM visits WHERE tenant_id = ${tenantId}::uuid)`
  : Prisma.empty;
```

---

### 3. `src/routes/propertyRoutes.ts`

Adicionada documentação Swagger para os dois novos parâmetros:

```yaml
- in: query
  name: landlordId
  description: Filtra imóveis por locador (UUID). Exibe todos os status do proprietário.
  schema:
    type: string
    format: uuid

- in: query
  name: tenantId
  description: Filtra imóveis nos quais o inquilino tem visita agendada (UUID).
  schema:
    type: string
    format: uuid
```

---

## Como usar

### Tela "Meus Imóveis" (locador)

```
GET /api/properties/search?landlordId=<uuid-do-locador>
```

Retorna todos os imóveis do locador, **independente do status** (AVAILABLE, IN_NEGOTIATION, RENTED).

### Imóveis visitados por um inquilino

```
GET /api/properties/search?tenantId=<uuid-do-inquilino>
```

Retorna imóveis nos quais o inquilino possui visita registrada.

### Combinação com outros filtros

Os novos parâmetros são combináveis com todos os filtros existentes:

```
GET /api/properties/search?landlordId=<uuid>&orderBy=createdAt&page=1&limit=20
```

---

## Análise de Impacto

| Camada | Impacto |
|---|---|
| **API pública** | Apenas adição de parâmetros opcionais — sem quebra de contrato |
| **Banco de dados** | Sem migrações — `landlordId` já existe em `Property`; `tenantId` é filtrado via `visits` |
| **Testes existentes** | Nenhum teste importava `PropertySearchParams` — sem quebras |
| **Frontend Flutter** | Pode passar `landlordId: userId` em `SearchFilters` imediatamente |
| **Prisma client** | `prisma generate` foi executado para sincronizar os tipos |

---

## Dependências e Próximos Passos

- **§5 (Proposals):** Quando implementado, o filtro `tenantId` poderá incluir imóveis com propostas ativas.
- **§2 (Analytics):** O campo `views` em `Property` já existe e pode ser agregado junto com dados de `visits` para o endpoint de analytics.
