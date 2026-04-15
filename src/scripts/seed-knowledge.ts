import { PrismaClient } from '@prisma/client';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const prisma = new PrismaClient();

async function popularBaseDeConhecimento() {
  console.log("Iniciando a ingestão de documentos...");

  // 1. O Documento Original (Poderia vir de um PDF ou arquivo TXT)
  const regrasDeLocacao = `
    Regras de Locação OmniConnect:
    1. O valor do caução é sempre de 3 vezes o valor do aluguel.
    2. Animais de estimação são permitidos apenas mediante autorização prévia por escrito do proprietário.
    3. O vencimento do aluguel ocorre todo dia 10 de cada mês.
    4. A quebra de contrato antes de 12 meses gera multa de 3 aluguéis proporcionais.
  `;

  // 2. Fatiar o texto (Chunking) usando LangChain
  // A IA não lê o livro todo de uma vez, ela lê parágrafos.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 150, // Tamanho de cada "fatia"
    chunkOverlap: 20, // Sobreposição para não cortar ideias pela metade
  });

  const pedacosDeTexto = await splitter.createDocuments([regrasDeLocacao]);
  
  // 3. Inicializar a IA que transforma texto em números (Embeddings)
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'text-embedding-3-small' // Modelo otimizado de 1536 dimensões
  });

  // 4. Gerar os vetores e salvar no PostgreSQL via Prisma
  for (const pedaco of pedacosDeTexto) {
    const conteudo = pedaco.pageContent;
    
    // O LangChain gera o array de 1536 números
    const vetor = await embeddings.embedQuery(conteudo); 
    
    // Como o Prisma lida com pgvector de forma nativa, podemos usar query raw para inserir o vetor
    // O operador '::vector' converte o array para o tipo correto do Postgres
    await prisma.$executeRaw`
      INSERT INTO knowledge_documents (id, title, content, embedding)
      VALUES (gen_random_uuid(), 'Regras de Locação', ${conteudo}, ${vetor}::vector)
    `;
  }

  console.log("✅ Base de conhecimento alimentada com sucesso!");
}

popularBaseDeConhecimento().catch(console.error);