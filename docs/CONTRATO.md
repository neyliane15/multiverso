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

## Tabelas (nomes em português, como no banco)

```
restaurantes        tenant + identidade visual (logo, cores, fontes, raio)
perfis              usuário, espelha auth.users
categorias          1.2
setores             1.3
produtos            1.1
produto_setores     N:N produto × setor, com unidade e custo POR SETOR
contagens           2.1 / 2.2
contagem_itens      linha da contagem (produto × setor)
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
mv_fechar_contagem(contagem) -> contagens
mv_reabrir_contagem(contagem) -> contagens

mv_gerar_lista_compras(restaurante, nome, categorias[]) -> uuid
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
