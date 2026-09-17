# Seed — carga do primeiro restaurante

`0001_bar_do_zeca.sql` carrega o **Bar do Zeca — Norte Shopping** com a contagem
fechada de **agosto/2026**: 21 categorias, 6 setores, 852 produtos, 866 vínculos
produto × setor e 866 itens de contagem, somando **78.681,3573**.

O arquivo é **gerado**, não escrito à mão. A origem é
`dados/contagem-bar-do-zeca-2026-08.json` (a planilha do cliente já extraída e
conferida); o gerador é `scripts/gerar-seed.mjs`.

```bash
npm run seed:gerar     # reescreve 0001_bar_do_zeca.sql a partir do JSON
npm run seed:conferir  # confere o SQL contra o JSON, sem banco
npx vitest run         # o mesmo, como teste automatizado
```

## Ordem de aplicação

1. **As migrações primeiro.** O seed não cria nada de estrutura: ele espera as
   tabelas, os índices únicos e os triggers de `supabase/migrations/`.

   ```bash
   supabase db push          # ou: supabase migration up, no ambiente local
   ```

2. **Depois o seed.** `supabase db push` não aplica esta pasta, então o arquivo
   vai por `psql`, sempre com `ON_ERROR_STOP=1` — sem isso o psql segue em
   frente depois de um erro e o `commit` do fim vira um rollback silencioso:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/0001_bar_do_zeca.sql
   ```

   No ambiente local do Supabase CLI, `$DATABASE_URL` costuma ser
   `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

3. **Os usuários depois.** O seed não cria perfil nenhum: `perfis` espelha
   `auth.users`, e quem nasce lá é o convite do Supabase Auth. Por isso a
   contagem fica com `criado_por` e `fechado_por` nulos.

O arquivo inteiro roda dentro de uma transação (`begin; … commit;`). Ou entra
tudo, ou não entra nada.

## Reaplicar é seguro

Todos os ids são UUIDv5 derivados do nome, e todo `insert` tem `on conflict`
apoiado na chave primária ou em índice único. Rodar duas vezes atualiza as
mesmas linhas em vez de duplicar — inclusive a contagem, que é **reaberta** no
começo do arquivo e fechada de novo no fim. A reabertura não é detalhe de
estilo: o trigger `t_contagem_itens_bloqueio` recusa qualquer escrita em item de
contagem fechada, então sem ela a segunda aplicação falharia.

O que o seed **não** faz é remover cadastro que saiu do JSON. Produto apagado da
planilha continua no banco (e o bloco de verificação vai acusar a contagem
errada). Nesse caso, limpe à mão ou recrie o banco.

## O que o bloco de verificação garante

O último trecho do arquivo é um `do $$ … $$` que consulta o que acabou de
entrar e derruba a transação inteira com `raise exception` se:

| Verificação | Por quê |
|---|---|
| soma de `contagem_itens.total` difere de `78681.3573` em mais de R$ 0,01 | é o número que o cliente conferiu na planilha; a tolerância de um centavo cobre arredondamento de exibição, nada além disso |
| produtos ≠ 852 | carga parcial ou produto duplicado por nome |
| vínculos produto × setor ≠ 866 | idem, do lado do N:N |
| itens da contagem ≠ 866 | a folha de contagem tem de espelhar o cadastro |
| categorias ≠ 21 ou setores ≠ 6 | carga parcial |
| a contagem não terminou `fechada` | contagem aberta não entra no CMV nem no histórico |

O total é **somado do banco** no fechamento, nunca copiado da planilha: se um
item entrar torto, a soma muda e a verificação reprova. É essa a diferença entre
conferir e apenas repetir o número.

### 869 linhas na planilha, 866 no banco

A extração traz 869 linhas, mas três delas repetem um par produto × setor que já
havia aparecido antes — o mesmo item listado em dois blocos da mesma aba:

| Produto | Setor | 2ª ocorrência | Custo descartado |
|---|---|---|---|
| BACON | Porcionados | `Porcionados!A95` | 25,99 (fica 25,75) |
| BARRIGA SUÍNA | Porcionados | `Porcionados!A103` | 29,75 (fica 21,85) |
| POLIFLOR | Estoque Geral | `Geral!V122` | 0,00 |

O schema só admite um registro por par — `primary key (produto_id, setor_id)` em
`produto_setores` e `unique (contagem_id, produto_id, setor_id)` em
`contagem_itens` — então vale a primeira ocorrência, que é a linha de cima na
planilha. **As três repetidas estão com quantidade zero, então o total da
contagem não muda**: 78.681,3573 continua de pé. Se um dia a planilha vier com
quantidade numa linha repetida, o gerador continua descartando a segunda, mas o
total deixa de fechar e a verificação reprova a carga — que é exatamente o
comportamento desejado.

## Identidade visual

O seed grava as cores e fontes do Bar do Zeca em `restaurantes`: fundo de
madeira escura, âmbar de chope na primária, verde de garrafa na secundária e
vermelho de toldo no acento, com títulos em Bitter e texto em Inter. As cores de
marca e as 27 cores de categoria e setor passam de 4,5:1 sobre o fundo e sobre a
superfície — o gerador calcula o contraste e se recusa a escrever cor reprovada.
