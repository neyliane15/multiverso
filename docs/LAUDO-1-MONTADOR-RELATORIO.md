# Laudo — Agente 1 (Montador) · Vendas, dashboard e relatório de contagem

Branch `claude/clever-mccarthy-nnbtas`, quatro commits locais. Nada foi
empurrado e nenhum PR foi aberto.

| Commit | O que entra |
|---|---|
| `0416aa3` | Migração 0023 (vendas, explosão, relatório) + 91 casos na suíte de banco |
| `0020844` | Tipos, hooks e os dois arquivos de lógica pura com teste |
| `d3f76e7` | As três telas, as rotas, e um furo do guarda de rota fechado |
| `831daaa` | Três defeitos que só o navegador pegou |

---

## 1. O que foi construído

### 1.1 Banco — `supabase/migrations/20260901000023_vendas_e_relatorio_de_contagem.sql`

**Tabelas.** `vendas` (restaurante, `referencia` = fim do período, `inicio`
opcional, status aberta/fechada/cancelada, `origem`, `origem_arquivo`,
totais congelados no fechamento, autoria) e `venda_itens` (ficha com
`restrict`, quantidade, `preco_unitario` congelado, `total` gerado,
`descricao_origem`, único por `(venda_id, ficha_id)`).

**Guarda-corpos por gatilho.** Ficha de outro restaurante é recusada; ficha de
produção é recusada (`fichas.producao = true` é insumo interno); venda fechada
é imutável, como contagem fechada.

**`mv_produtos_da_ficha(ficha, nível)`** — o gêmeo de `mv_custo_da_producao`
(0022) do outro lado da conta. Mesma semântica, copiada de propósito:
`quantidade / (1 − perda/100) × fator ÷ rendimento`, produção filha convertida
pela `unidade_rendimento` dela via `mv_fator_unidade`, teto de 10 níveis. A
conversão até a unidade de compra é `mv_fator_para_produto`, que já existia e
já sabe que 60 ML numa garrafa de 965 ML são 0,0622 garrafa — não escrevi
conversão nova.

**`mv_vendas_por_produto(venda)`** — explode um lançamento inteiro, uma linha
por produto.

**`mv_relatorio_de_contagem(contagem)`** — as dezoito colunas pedidas.

**`vw_contagem_procedencia`** — o rodapé do dashboard.

RLS nas duas tabelas no padrão da casa, `grant` e `grant execute` re-outorgados
no fim (todo `drop view`/`drop function` leva o grant junto). A migração
sobrevive à segunda passada — a suíte a aplica duas vezes.

### 1.2 Frontend

- `web/src/tipos/banco.ts` — `Venda`, `VendaItem`, `LinhaDoRelatorio`,
  `VendaPorProduto`, `ContagemProcedencia`, `StatusVenda`, `OrigemVenda`.
- `web/src/dados/consultas.ts` — nove hooks novos, chaves novas em `chaves`.
- `web/src/paginas/contagem/logicaDoDashboard.ts` + `.test.ts` (50 testes)
- `web/src/paginas/contagem/logicaDoRelatorio.ts` + `.test.ts` (32 testes)
- `web/src/paginas/contagem/SeletorDeContagem.tsx` — a peça que as duas telas
  dividem, para nunca abrirem em contagens diferentes.
- `Dashboard.tsx` → `/contagem/dashboard`
- `Relatorio.tsx` → `/contagem/relatorio`
- `Vendas.tsx` → `/contagem/vendas`
- `rotas.ts` e `App.tsx`.

---

## 2. As decisões que tomei, e por quê

### 2.1 Fator nulo **marca** a linha em vez de contaminar a ficha inteira

No custo (0022), fator nulo contamina: a ficha volta sem número, e é o certo lá
— custo pela metade não é custo. Na quantidade a escolha é outra: a linha volta
com `quantidade` nula e um `motivo` que **nomeia o insumo**.

O motivo é operacional. Medido na carga real: 50 G de limão numa ficha cujo
produto é comprado por UND não converte. Se a venda de limão virasse zero, o
IDEAL subiria, a DIFERENÇA apareceria como sobra inexplicada, e o relatório
estaria acusando furto onde há cadastro incompleto. Com a linha marcada, a
tela diz qual insumo arrumar.

### 2.2 Duas leituras diferentes de "faltou"

| Situação | O que o relatório faz |
|---|---|
| **Não existe contagem anterior** (a primeira da casa) | `contagem_anterior`, `compras`, `vendas`, `consumo`, `ideal` e `diferenca` voltam **nulos**, com pendência escrita. Não há período, logo não há o que somar. |
| **Existe a anterior, e o produto não estava na folha dela** | O anterior é lido como **zero** — é o que a foto registra — e a pendência diz, com todas as letras, que foi lido como zero. |

O segundo caso foi decisão minha e vale discussão. Devolver nulo ali esvaziaria
a linha justamente dos insumos novos, que são onde o dinheiro acabou de entrar
(`SAL` entrou por nota de 4 KG no meio do período, e com nulo o consumo dele
seria desconhecido em vez de 4). Para não virar invenção silenciosa, o número
vem acompanhado da frase que o explica.

### 2.3 O intervalo é `(anterior, atual]`

Aberto no início porque a contagem anterior **já fotografou** aquele dia:
nota emitida no dia da contagem anterior já está dentro do estoque dela, e
contá-la de novo somaria a mesma caixa duas vezes. Testado com uma nota de
99 KG em 01/08 que **não** entra nos 10 KG do período.

### 2.4 A média divide pelo número de vendas, não pelo número de aparições

Semana sem vender picanha é semana de zero picanha, e zero faz parte da média.
Dividir pelas aparições inflaria a sugestão exatamente dos itens que menos
saem. `vendas_consideradas` diz quantas entraram (1, 2 ou 3).

### 2.5 As duas bordas, decididas de propósito

| Borda | Banco | Tela |
|---|---|---|
| `contagem_atual == media_3`, ambas > 0 | `precisa_comprar = true`, `sugestao = 0` | "No limite da média" + "O estoque empata com a média: não sobra folga." |
| `media_3` nula (zero venda fechada) | `precisa_comprar` e `sugestao` **nulos** | "Não se sabe" + o motivo |
| `contagem_atual == media_3 == 0` | `precisa_comprar = true`, `sugestao = 0` | **"Sem movimento"** — ver §3.1 |

A regra da cliente diz "se a contagem atual for MAIOR que a média, não precisa
comprar". No empate ela não é maior, logo cai do outro lado. Teste próprio para
cada borda, nos dois lados (SQL e TS).

### 2.6 Dinheiro soma sempre; quantidade, não

No dashboard, um produto contado em dois setores com unidades diferentes (CX no
depósito, UND no bar) tem a `quantidade` anulada e a célula diz "unidades
diferentes". O `total` em R$ continua valendo, porque dinheiro soma. É a mesma
regra da ficha técnica.

### 2.7 A procedência não inventa nada

`fichas.origem_carga` não se aplica à contagem: ela nasce da folha e é
preenchida à mão, não de arquivo. O rodapé afirma só o que o banco sabe —
quem abriu, quem fechou, quando, quantas abas, quantas linhas ficaram sem
resposta. Quando não há autor (folha vinda de carga), a frase **omite o nome**
em vez de inventar um ex-funcionário.

---

## 3. Os números medidos

### 3.1 Suíte de banco — 91 casos novos (`supabase/testes/20_fluxos.sql`)

`perform conferir` em `20_fluxos.sql`: **138 → 229**. (A mensagem do commit
`0416aa3` diz 85; aquele número saiu de um `grep` por rótulos e ficou curto. O
número certo é 91, e é este.)

Árvore de três níveis de produção, montada para ser conferível de cabeça:

```
EMPADÃO (venda, rende 1 porção)
  └─ EMPADÃO CRU (produção, rende 4 UND)
       ├─ MASSA   (produção, rende 1 KG) ── FARINHA 800 G
       └─ RECHEIO (produção, rende 2 KG) ── CEBOLA 500 G, perda 20%
```

| Conta | Esperado | Medido |
|---|---|---|
| farinha por porção de empadão | 0,25 × 0,8 ÷ 4 | **0,05 KG** |
| cebola por porção (com perda de 20%) | 0,5 × 0,3125 ÷ 4 | **0,0390625 KG** |
| 60 ML de vodka numa garrafa de 1000 ML | 60 ÷ 1000 | **0,06 UND** |
| 50 G de limão por UND sem conteúdo | — | **nulo + motivo**, nunca 0 |
| 300 empadões vendidos | 300 × 0,05 | **15 KG de farinha** |
| farinha no período | 20 + 10 − 12 | consumo **18** |
| | 20 + 10 − 15 | ideal **15**, diferença **−3** |
| média de 3 vendas | (15 + 10 + 5) ÷ 3 | **10** → 12 > 10, não precisa comprar |
| azeite (empate) | média (3+2+1)÷3 = 2, atual 2 | **precisa_comprar = true, sugestão 0** |
| nota de 99 KG em 01/08 (dia da foto anterior) | fora do intervalo | compras = **10**, não 109 |

Isolamento com identidade de verdade (`set local role authenticated` +
`request.jwt.claim.sub` dentro da transação): o admin da "Prova" lê **0**
vendas da "Maia", a explosão da venda dela volta **vazia**, e
`mv_relatorio_de_contagem` recusa com "contagem não encontrada" — **nos dois
sentidos** — enquanto cada um continua lendo o seu (882 e 6 linhas).

### 3.2 Conferência independente contra o banco de verdade

Com os 854 produtos e as 69 fichas do Bar do Zeca, refiz a explosão com uma
consulta escrita **sem** `mv_produtos_da_ficha` e **sem**
`mv_vendas_por_produto` — só as tabelas e `mv_fator_para_produto`:

| Insumo | À mão | Pela função |
|---|---|---|
| ÁGUA COM GÁS (350ml) | 176,700000 | 176,700000 |
| CAFÉ CAPSULA | 114,000000 | 114,000000 |
| ESPUMANTE SALTON | 51,474000 | 51,474000 |
| LIMÃO TAHITI | 42,600000 | 42,600000 |
| XAROPE DE MARACUJA | 23,880000 | 23,880000 |

E uma linha inteira conferida à mão (ÁGUA COM GÁS): 132 + 0 − 72 = **60**
(consumo); 132 − 176,7 = **−44,7** (ideal); 72 − (−44,7) = **+116,7**
(diferença); 176,7 ÷ 3 = **58,9** (média); 72 > 58,9 → **não precisa comprar**.

O segundo restaurante, por inteiro: ARROZ 40 + 30 − 52 = **18** consumo,
40 + 30 − 16 = **54** ideal, 52 − 54 = **−2** diferença, média 16 ÷ 1 = **16**.
A venda de 16 KG sai de 80 porções × 200 G. Tudo bate.

### 3.3 Custo das consultas

| Consulta | Medido |
|---|---|
| `mv_relatorio_de_contagem` (882 linhas, 3 vendas de 10 fichas, 868 itens de contagem) | **127–181 ms** |
| `mv_vendas_por_produto` de um lançamento de 10 fichas | **9,5 ms** |
| `useItensDaContagem` (reaproveitado do módulo, 868 linhas) | cache compartilhado com a folha |

Por isso `useRelatorioDeContagem` leva `staleTime` de 5 min: o número não muda
enquanto a contagem escolhida não muda, e quem alterna entre as duas telas do
módulo não paga 150 ms de ida-e-volta a cada troca. A invalidação é cirúrgica:
salvar um item de venda **aberta** não derruba relatório nenhum (venda aberta
não entra em conta); só `mv_fechar_venda`, `mv_reabrir_venda` e apagar
derrubam, e aí derrubam o prefixo `['relatorio']` inteiro, porque o fechamento
muda a média de três semanas de uma vez.

### 3.4 Navegador (Chromium, `admin@bardozeca.com.br` / `master@multiverso.app`)

- As três telas com os 868 itens e as 4 vendas de verdade. **Sem erro de
  console** além do TLS das fontes do Google pelo proxy.
- Um lançamento **criado, salvo e fechado pela tela**: período 09/10–15/10,
  40 × CAIPIRINHA HH, conferido no banco.
- O master trocando de restaurante na barra de cima: o dashboard repinta de
  "868 itens · R$ 71.961,35" para "2 itens · R$ 620,00", e o relatório junto.
  Os R$ 620 conferem à mão: 52 KG × 8 + 17 KG × 12.
- Prints em `/tmp/claude-0/-home-user/ea7223e1-0cfd-5570-ae56-c7244317aec2/scratchpad/prints`.

### 3.5 `npm run verificar`, rodado **depois** da última mudança de código

720 testes, typecheck, build, conferência do `vercel.json` e a suíte de banco
(91 casos novos) — tudo passando.

---

## 4. Três coisas que só a tela aberta pegou

**538 "precisa comprar" de nada.** A regra aplicada ao pé da letra marcava
882 → 538 linhas como compra pendente, quase todas de insumo que não foi
vendido *e* não está em estoque. A tela passou a nomear o sub-caso
(`sem_movimento`) sem mudar número nenhum. Depois: **5** de compra
(R$ 267,65), 339 com sobra, 533 sem movimento, 5 sem resposta.

**O rodapé mentia sobre 342 linhas.** `itens_respondidos` contava só
`contado_em is not null`, e a carga de planilha grava quantidade sem carimbo —
o rodapé dizia "868 linhas sem resposta, elas entram como zero" numa contagem
com 342 preenchidas. Agora "respondido" é carimbo **ou** quantidade: 342 e
526, e 526 é exatamente o número de zerados do KPI.

**"Aberta por alguém que saiu do sistema."** Autor nulo numa folha de carga é
ausência de pessoa, não pessoa que foi embora.

---

## 5. Um furo de segurança fechado no caminho

`rotaPermitidaNoSetor` liberava o prefixo `/contagem/` inteiro, porque até
hoje a única coisa depois da barra era um uuid. Bastaria nascer
`/contagem/dashboard` para o operador preso ao bar abrir o estoque, o consumo e
a venda da casa inteira digitando o endereço — e a RLS **não** salvaria a tela
disso: ela entregaria o total de um setor só, com cara de total da casa, que é
pior que uma recusa. O guarda passa a distinguir página nomeada de id, com
seis casos novos em `rotas.test.ts`.

E, de quebra: `FichaCompleta` nunca soube de `fichas.producao`, coluna que
existe desde a 0022. Sem ela a tela de vendas estaria a um `any` de aceitar
lançar "massa do empadão" como item de cardápio. Entraram `producao` e
`usada_em` no tipo.

---

## 6. O que ficou de fora, de propósito

1. **Importação de PDV.** Só o encaixe: `vendas.origem`, `vendas.origem_arquivo`
   e `venda_itens.descricao_origem`, nos mesmos papéis que
   `notas_fiscais.origem` e `nota_itens.descricao` cumprem nas compras.
2. **Seed de vendas.** Nada em `supabase/seed/` — a prova foi feita no meu
   próprio banco, como pedido.
3. **Visão consolidada de rede.** Decisão da cliente: cada restaurante vê o seu.
4. **Tela de produção na ficha.** A 0022 criou a coluna e o frontend nunca a
   expôs; eu só acrescentei o campo ao tipo. Criar produção pela tela continua
   impossível — é trabalho de outro agente, e eu não o fiz para não invadir.
5. **Conversão de unidade na contagem do dashboard.** O relatório converte
   (`mv_fator_para_produto`); o dashboard apenas detecta divergência e anula a
   quantidade. Ver §7.3.

---

## 7. O que eu atacaria primeiro, se fosse o revisor

### 7.1 `contagem_anterior = 0` para produto ausente da folha anterior (§2.2)

É a única decisão deste trabalho em que escrevo um número que o banco não
mediu. Está acompanhada de pendência em texto e tem teste, mas é **a** escolha
a contestar. A alternativa (nulo) é mais conservadora e deixa o relatório mudo
justamente sobre os insumos novos. Escolhi o número com a explicação colada;
um revisor pode preferir o silêncio.

### 7.2 A unicidade de `vendas(restaurante_id, referencia)`

Barra dois lançamentos para a mesma data de fim. Isso é o que impede a planilha
duplicada — e é também o que vai bater na cara da importação de PDV quando
alguém já tiver lançado aquela semana à mão. Eu acho certo barrar e mandar
cancelar o manual primeiro; vale confirmar com a cliente antes que a importação
seja escrita.

### 7.3 A contagem do dashboard não converte unidade; a do relatório converte

`mv_relatorio_de_contagem` passa a quantidade da contagem por
`mv_fator_para_produto` (e marca pendência quando não converte — foi assim que
apareceu `APERITIVO DE CARNE (ALCATRA)`, contado em UND com produto cadastrado
em KG). O dashboard, por consolidar no navegador, só detecta divergência
**entre paradas** e anula. Resultado: o mesmo produto pode aparecer com
quantidade no dashboard e com pendência no relatório. Os dois estão certos
dentro da própria regra, mas a casa deveria ter **uma** regra.

### 7.4 `mv_relatorio_de_contagem` a 127–181 ms com três vendas de dez fichas

O tempo cresce com fichas vendidas × itens de ficha, não com o catálogo. Três
vendas de dez fichas é pouco: a casa real vende 69 fichas por semana. Vale
medir com um lançamento de 69 linhas antes de prometer a tela para a cliente.
Não medi isso, e não vou dizer que medi.

### 7.5 A tabela de onze colunas

Rola na horizontal abaixo de ~1500px mesmo com a calha apertada para 12px. O
celular vira cartão (`xl:hidden`), mas a faixa entre 1280 e 1500 fica no pior
dos dois mundos. Um revisor pode querer subir o corte para `2xl`.

### 7.6 `vendas_consideradas` é global, não por insumo

É a contagem de vendas fechadas na janela, igual para todas as linhas. Um
insumo que só existe desde a semana passada tem a média dividida por 3 mesmo
assim — o que está certo (ele vendeu zero nas outras duas), mas a coluna não
distingue "vendeu 0" de "não existia". Nenhum teste cobre esse caso.

### 7.7 O teto de 10 níveis não tem teste

`mv_produtos_da_ficha` levanta exceção acima de 10 níveis, copiando
`mv_custo_da_producao`. Não construí uma árvore de 11 níveis para provar —
o guarda de ciclo da 0022 torna o caso difícil de montar, mas "difícil" não é
"testado".
