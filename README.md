# Multiverso

Sistema de gestão para restaurantes, multiusuário e **multimarca**: cada
restaurante que entra no sistema traz a própria logomarca, as próprias cores e
as próprias fontes, e o app inteiro se repinta a partir do banco.

Um **admin master** cadastra os restaurantes, cria os usuários de cada um e
monitora a rede. Dentro de cada restaurante, a equipe conta estoque, lança
nota fiscal e acompanha o CMV.

O nome não é decorativo: são vários mundos — cada restaurante com a sua cara —
rodando sobre a mesma base.

## O problema que ele resolve

A operação de um restaurante vive em planilhas. A contagem de agosto do Bar do
Zeca, que é o primeiro cliente deste sistema, é uma pasta com oito abas, quatro
blocos de colunas lado a lado na aba principal, e totais somados à mão em
lugares diferentes. Funciona — mas só uma pessoa sabe mexer, e o número do CMV
depende de ninguém ter arrastado uma célula errada.

O sistema pega essa mesma estrutura e a torna um cadastro de verdade:

```
CMV = Estoque Inicial + Compras − Estoque Final
```

Os três números vêm de fontes diferentes e nenhum é chutado. Se faltar a
contagem que fecha o período, o CMV volta **nulo com o motivo escrito**, em vez
de um número que parece certo.

## Módulos

| Nº | Módulo | O que faz |
|---|---|---|
| **1** | **Cadastros** | Produtos, categorias e setores. Um produto tem uma categoria e vive em **vários setores** — e cada setor guarda a própria unidade e o próprio custo |
| **2** | **Gestão de Contagem** | A folha de contagem montada a partir dos cadastros, setor por setor, com histórico de todas as contagens fechadas |
| **3** | **Gestão de Compras** | Nota fiscal por XML (lê tudo sozinho), por PDF ou na mão para a compra de rua; lista de compras gerada do catálogo; histórico por período e fornecedor |
| **4** | **Dashboard CMV** | Estoque inicial, compras e estoque final — semanal e mensal, com abertura por categoria |

Mais módulos entram depois. A base foi desenhada para isso: um módulo novo é
uma entrada em `web/src/rotas.ts` mais as suas tabelas, e ele já nasce com
RLS, marca e navegação.

### Por que o produto vive em vários setores

Porque na prática ele vive. Na planilha de origem, `FILÉ DE TILÁPIA` aparece
duas vezes: R$ 41,50/KG no estoque geral e R$ 6,34 a porção nos porcionados.
É o mesmo peixe, contado em dois lugares, com custo diferente em cada um.
Catorze produtos do primeiro cliente estão nessa situação.

Por isso o vínculo `produto_setores` carrega `unidade` e `custo` — e não o
produto.

## Papéis

| Papel | Alcance |
|---|---|
| `master` | A rede inteira. Cadastra restaurantes, cria admins, monitora tudo |
| `admin` | O próprio restaurante, incluindo equipe e identidade visual |
| `gerente` | Cadastros, contagem e compras do próprio restaurante |
| `operador` | Lança contagem e compras. Não apaga cadastro |

Quem decide isso não é a interface: é a **RLS do Postgres**. Um `operador` que
montasse a requisição na mão continuaria não enxergando outro restaurante.

## Como rodar

```bash
npm install
cp .env.example .env        # preencha com a URL e a anon key do seu projeto
npm run dev
```

O banco:

```bash
supabase db push                                   # aplica as migrações
psql "$DATABASE_URL" -f supabase/seed/0001_bar_do_zeca.sql   # carga do 1º cliente
```

A carga termina com um bloco que **aborta** se o total da contagem não bater
com os R$ 78.681,3573 da planilha de origem.

```bash
npm test          # suíte completa
npm run typecheck
npm run build
```

## Arquitetura

Não há servidor Node próprio. O navegador fala direto com o Supabase e a RLS é
quem decide o que cada um enxerga. A única função de servidor é a Edge Function
que importa NFe, e mesmo ela roda com o token do usuário para que as políticas
continuem valendo.

```
supabase/migrations/   schema versionado: tenancy, cadastros, contagem, compras, CMV, RLS
supabase/seed/         carga conferida do primeiro restaurante
supabase/functions/    importador de NFe
dados/                 a planilha de origem, extraída e reconciliada
scripts/               geração e conferência da carga
web/src/
  tema/                identidade visual por restaurante
  componentes/         primitivas da interface
  paginas/             uma pasta por módulo
  dados/               acesso ao Supabase (um hook por pergunta)
  tipos/               espelho do schema em TypeScript
  util/                formatação pt-BR
docs/CONTRATO.md       o contrato que todo mundo segue
docs/IDENTIDADE.md     a direção visual
```

## O primeiro cliente

**Bar do Zeca — Norte Shopping**, contagem de agosto de 2026:

| | |
|---|---|
| Produtos | 853 |
| Vínculos produto × setor | 870 |
| Setores | 6 — Bar, Estoque Geral, Hortifrúti, Massas e Panificação, Molhos e Caldos, Porcionados |
| Categorias | 21 |
| Valor do estoque | **R$ 78.681,36** |

A extração foi conferida item a item contra os totais da própria planilha:
cada bloco, cada aba e o total geral fecham com **diferença zero**. O script
que faz isso está em `dados/` e pode ser rodado de novo a qualquer momento.
