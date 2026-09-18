# Rodar o Multiverso na máquina

Sobe o sistema inteiro localmente, com os **854 produtos do Bar do Zeca**
dentro, sem projeto na nuvem e sem Docker.

```bash
ferramentas/local/subir.sh
npm run dev          # ou npx vite preview, depois de npm run build
```

Entrar com qualquer um destes, senha `multiverso`:

| E-mail | Papel | O que enxerga |
|---|---|---|
| `master@multiverso.app` | master | A rede inteira |
| `admin@bardozeca.com.br` | admin | O Bar do Zeca, incluindo equipe e marca |
| `estoque@bardozeca.com.br` | operador | Lança contagem e compras |

## O que é real aqui

O Postgres, as migrações, **a RLS**, a carga conferida, o PostgREST e o caminho
HTTP inteiro que o `@supabase/supabase-js` percorre. O token é assinado com o
mesmo segredo que o PostgREST verifica, então a política de cada tabela decide
de verdade quem vê o quê — entrar como operador e como master dá telas
diferentes porque o **banco** devolve linhas diferentes, não porque a interface
esconde algo.

Foi assim que apareceu o defeito corrigido na migração `0007`: o cartão do
período dizia "sem CMV" e a tabela logo abaixo mostrava R$ 38.905,46 em
bebidas, calculado com estoque final zero. Nenhum teste pegou; a tela aberta
pegou.

## O que é de mentira

Só a checagem de senha. O `portao.mjs` faz o papel do Kong + GoTrue, e o GoTrue
tem convite, recuperação e refresh que não cabe reimplementar — e não é o que
este ambiente serve para testar.

**Storage e Edge Functions não existem aqui** e respondem 501 dizendo isso, em
vez de falharem com erro de rede que parece bug do app. Ou seja: envio de
logomarca e importação de XML de NFe **precisam de um projeto Supabase de
verdade** para serem exercitados ponta a ponta. O parser de NFe roda no
cliente e continua testado por unidade (103 testes).

## Requisitos

- Postgres 16 no sistema (o script cria o cluster sozinho)
- [PostgREST](https://github.com/PostgREST/postgrest/releases) no `PATH` —
  binário estático, sem dependência
- Node 20+

## Como parar

```bash
kill "$(cat "${TMPDIR:-/tmp}/multiverso-local/postgrest.pid")"
kill "$(cat "${TMPDIR:-/tmp}/multiverso-local/portao.pid")"
```

Logs em `${TMPDIR:-/tmp}/multiverso-local/`.
