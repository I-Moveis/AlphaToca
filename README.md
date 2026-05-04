# I-Moveis API

O I-Moveis é uma API backend projetada para uma plataforma de aluguel de apartamentos. O sistema utiliza o WhatsApp como o canal principal de geração e qualificação de leads, realizando uma transição suave dos usuários qualificados para o aplicativo móvel/web para a descoberta e visualização detalhada de imóveis.

## Visão Geral

A plataforma atende a três públicos principais:
- **Inquilinos**: Procuram apartamentos e interagem primariamente via WhatsApp para triagem e dúvidas.
- **Proprietários/Administradores**: Gerenciam anúncios de imóveis e recebem leads pré-qualificados automaticamente.
- **Corretores de Imóveis**: Utilizam a plataforma para automatizar o primeiro contato e a filtragem de interessados.

### Principais Funcionalidades
- **Integração Direta com WhatsApp**: Webhook otimizado para processamento de mensagens recebidas e envio de respostas orientadas por IA.
- **Sistema RAG (Retrieval-Augmented Generation)**: Qualificação de leads, entendimento de intenções e respostas a perguntas frequentes de forma automatizada e inteligente.
- **API de Busca de Imóveis**: Listagem, busca e administração de dados imobiliários que alimentam as interfaces web e mobile.
- **Transição de Canal Unificada**: Sincronia de estado para uma experiência contínua entre a conversa no WhatsApp e a visualização no aplicativo.

## Stack Tecnológica

O I-Moveis é construído sobre uma arquitetura moderna para suportar alto desempenho e integração com IA:

- **Linguagem e Runtime**: TypeScript no Node.js.
- **Framework Web**: Express.
- **Banco de Dados**: PostgreSQL com extensão `pgvector` (armazenamento de dados relacionais e vetoriais).
- **ORM**: Prisma.
- **Autenticação e Identidade**: Auth0 (JSON Web Tokens - JWT).
- **Mensageria e Processamento em Background**: Redis e BullMQ (processamento assíncrono essencial para os fluxos de IA do WhatsApp).
- **Inteligência Artificial (IA/RAG)**: LangChain (versão Node.js).
- **Validação de Dados**: Zod.

## Como Interagir com a API

### Autenticação (Rotas Protegidas)

As rotas da aplicação (como as de gerenciamento em `/api/properties` e `/api/users`) são seguras e exigem um **Token Bearer JWT** emitido pelo Auth0.

Para se autenticar, você deve adicionar o cabeçalho `Authorization` nas requisições:

```http
Authorization: Bearer <SEU_TOKEN_JWT>
```

### Validação de Dados

Todos os payloads recebidos pela API (seja pelo app mobile ou pelos webhooks) são rigidamente validados utilizando o **Zod**. Qualquer envio que não esteja de acordo com as regras estabelecidas será imediatamente negado.

### Tratamento de Erros

A API possui respostas curtas, técnicas e padronizadas. Sempre que ocorrer um erro, o retorno seguirá a estrutura global `ErrorResponse`, acompanhado do status HTTP apropriado:

```json
{
  "status": 400,
  "code": "BAD_REQUEST",
  "messages": [
    "A mensagem detalhada sobre o que ocorreu, por exemplo, um erro de validação Zod."
  ]
}
```
*O bot integrado via WhatsApp possui mecanismos de contingência; em caso de incertezas da IA, ele responde com fallbacks predeterminados sem comprometer a interação amigável.*

### Principais Interfaces

1. **Gestão de Imóveis e Usuários**
   - Endpoints como `/api/properties` e `/api/users` proveem acesso para o app. Exigem autenticação e fornecem apenas os dados estritamente relevantes visando a economia de dados em redes móveis.

2. **Webhooks do WhatsApp**
   - O tráfego de entrada e as notificações da WhatsApp Cloud API são direcionados aos endpoints de webhook. 
   - A API valida a carga e a enfileira imediatamente em uma fila do BullMQ (retornando `200 OK` instantaneamente para o WhatsApp). O processamento complexo das mensagens e a interação com o LangChain ocorrem de forma assíncrona.
