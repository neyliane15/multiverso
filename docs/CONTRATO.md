# Contrato do Multiverso

Documento curto e obrigatório: todo agente que mexe no sistema segue o que
está aqui. Se algo neste arquivo estiver errado, corrija **aqui primeiro** e
depois no código.

## Stack

| Camada | Escolha |
|---|---|
| Banco / Auth / Storage | **Supabase** (Postgres 15+, RLS, Auth, Storage) |
| Frontend | React 18 + TypeScript + Vite + Tailwind v4 |
| Dados no cliente | `@supabase/supabase-js` + TanStack Query |
| Gráficos | Recharts |
| Ícones | lucide-react |
| Testes | Vitest |

Não há servidor Node próprio. O cliente fala direto com o Supabase, e a RLS é
quem decide o que cada um enxerga.

## Papéis

| Papel | Alcance |
|---|---|
| `master` | A rede inteira. Cadastra restaurantes, cria admins, monitora tudo. `restaurante_id` é nulo. |
| `admin` | O próprio restaurante, incluindo equipe e identidade visual. |
| `gerente` | O próprio restaurante: cadastros, contagem, compras. Não mexe em usuários nem na identidade visual. |
| `operador` | Lança contagem e compras. Não apaga cadastro. |

`mv_pode_operar(r)` = master, ou qualquer papel do restaurante `r`.
`mv_pode_administrar(r)` = master, ou **admin e gerente** de `r`.

`mv_pode_administrar` decide o CADASTRO (apagar produto, categoria, setor,
fornecedor) e nada mais. Equipe e identidade visual exigem admin, e as
políticas conferem `mv_papel_atual()` diretamente — usá-la sozinha nessas
tabelas deixa o gerente entrar (foi o defeito que a 0014 fechou).

### Convites — quem mexe em quem entra

| | master | admin | gerente | operador |
|---|---|---|---|---|
| ler | rede inteira | do próprio restaurante | — | — |
| criar | qualquer papel, qualquer restaurante | até `admin`, só no próprio | — | — |
| editar (pendente) | sim | sim, sem promover a `master` | — | — |
| apagar (pendente) | sim | sim, só do próprio | — | — |
| convite **aceito** | imutável | imutável | — | — |

Convite aceito é histórico: é o único registro de com que papel a pessoa foi
admitida e quem a admitiu. Ninguém edita nem apaga, master incluído.

### Como a pessoa convidada entra

1. quem administra grava o convite (e-mail, papel, restaurante);
2. a pessoa abre o sistema e usa **"Tenho um convite"** — e-mail do convite e
   uma senha que ela escolhe. A senha vai para o GoTrue e não passa por
   nenhuma tabela nossa;
3. o gatilho `mv_ao_criar_usuario` procura convite pendente e não vencido para
   aquele e-mail e cria o perfil com o papel do CONVITE. O `options.data` do
   `signUp` não decide nada (era o furo que a 0008 fechou);
4. sem convite, a conta existe no auth e fica sem perfil — estado seguro, e a
   tela `SemConvite` explica em vez de girar para sempre.

O convite vale 14 dias. Recuperação de senha é `resetPasswordForEmail` e volta
no evento `PASSWORD_RECOVERY`, que trava o app na tela de senha nova até
trocar — senão o link "funcionaria" sem trocar nada.

**Cuidado ao escrever política de UPDATE/DELETE.** O Postgres só aplica a
política de SELECT quando o comando lê colunas da tabela. `update t set x=1
where email='...'` passa pela política de SELECT; `update t set x=1`, sem
WHERE, não passa. Uma política de UPDATE mais frouxa que a de SELECT não fica
protegida pela de SELECT — os testes de RLS cobrem os dois casos de propósito.

## Tabelas (nomes em português, como no banco)

```
restaurantes        tenant + identidade visual (logo, cores, fontes, raio)
perfis              usuário, espelha auth.users
categorias          1.2
setores             1.3  quem conta: bar, estoque geral, camara fria
estoques            1.4  onde, dentro do setor: Bar > Geladeira 1
produtos            1.1
produto_setores     N:N produto x setor, com unidade e custo POR SETOR
produto_estoques    N:N produto x lugar. E lugar, nao preco: unidade e custo
                    continuam em produto_setores, um por setor. Um produto
                    pode estar em duas geladeiras do mesmo bar.
contagens           2.1 / 2.2
contagem_itens      linha da contagem (produto x setor x lugar)
                    unique (contagem, produto, setor, estoque) NULLS NOT
                    DISTINCT — estoque nulo = setor sem subdivisao, e duas
                    linhas nulas no mesmo setor continuam sendo duplicata
fornecedores        3.x
notas_fiscais       3.1  (origem: xml | pdf | manual)
nota_itens          item da nota, com de-para para produto
produto_apelidos    aprendizado do de-para
listas_compras      3.2
lista_compras_itens
```

### Funções de banco já prontas

```
mv_eh_master() / mv_restaurante_atual() / mv_papel_atual()
mv_pode_operar(uuid) / mv_pode_administrar(uuid)

mv_abrir_contagem(restaurante, referencia, tipo, titulo, setores[]) -> uuid
  Uma linha por LUGAR onde o produto vive naquele setor; uma linha com
  estoque nulo quando ele nao tem lugar nenhum ali. O join dos lugares e
  LATERAL de proposito: com left joins soltos, um produto em dois setores
  e com duas geladeiras num deles gerava duas linhas nulas no outro setor,
  e a contagem falhava ao abrir por duplicata.
mv_fechar_contagem(contagem) -> contagens
mv_reabrir_contagem(contagem) -> contagens

mv_gerar_lista_compras(restaurante, nome, categorias[]) -> uuid
  categorias = null  -> o cadastro ativo inteiro
  categorias = [a,b] -> so os produtos dessas categorias
  categorias = []    -> folha vazia (`= any('{}')` nao casa com nada)
  A tela precisa dizer em qual dos tres esta: uma folha filtrada e
  indistinguivel de um cadastro que sumiu.
mv_lancar_nota(nota) -> notas_fiscais

mv_cmv_periodo(restaurante, inicio, fim)
mv_cmv_por_categoria(restaurante, inicio, fim)
mv_cmv_serie(restaurante, 'semanal'|'mensal', periodos, ate)
```

### Views

`vw_produtos_completos`, `vw_contagens_resumo`, `vw_contagem_por_setor`,
`vw_compras_historico`, `vw_panorama_restaurantes` — todas com
`security_invoker = on`.

## Identidade visual por restaurante

As cores e fontes moram em `restaurantes` e chegam ao CSS como variáveis:

```
--mv-primaria  --mv-secundaria  --mv-acento
--mv-fundo     --mv-superficie  --mv-texto
--mv-fonte-titulo  --mv-fonte-texto  --mv-raio
```

Regra dura: **nenhum componente escreve cor de marca em hexadecimal**. Sempre
`var(--mv-*)` ou a classe utilitária correspondente. Cinzas neutros e estados
(sucesso, alerta, erro) podem ser fixos.

## Convenções

- Tudo em **português**: nomes de arquivo, variáveis, rotas, textos de tela.
- Dinheiro sempre `numeric` no banco e formatado com `Intl.NumberFormat('pt-BR')`.
- Quantidade guarda 4 casas; custo guarda 6. Só o **total** é arredondado.
- Nenhum número do dashboard é estimado: falta contagem, o CMV volta nulo com
  o motivo escrito.

## Estrutura de pastas

```
supabase/migrations/   SQL versionado (não editar migração já aplicada)
supabase/seed/         carga do primeiro restaurante
supabase/functions/    edge functions (importador de NFe)
dados/                 planilha de origem, já extraída e conferida
scripts/               geração e conferência de seed
web/src/
  tema/                design system e variáveis de marca
  componentes/         primitivas reutilizáveis
  paginas/             uma pasta por módulo
  dados/               hooks de acesso ao Supabase
  tipos/               tipos TypeScript do banco
  util/                formatação, datas, números
```
