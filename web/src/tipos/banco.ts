/**
 * Tipos do banco — espelho fiel das migrações em supabase/migrations.
 * Mudou o SQL? Mude aqui na mesma leva.
 */

export type PapelUsuario = 'master' | 'admin' | 'gerente' | 'operador'
export type TipoContagem = 'semanal' | 'mensal' | 'avulsa'
export type StatusContagem = 'aberta' | 'fechada' | 'cancelada'
export type OrigemNota = 'xml' | 'pdf' | 'manual' | 'planilha'
export type StatusNota = 'importada' | 'conferida' | 'lancada' | 'cancelada'
export type StatusLista = 'rascunho' | 'enviada' | 'concluida' | 'cancelada'
export type StatusVenda = 'aberta' | 'fechada' | 'cancelada'
export type OrigemVenda = 'manual' | 'pdv'
/** O que uma linha de venda aponta. Ver a migração 0027. */
export type AlvoDeVenda = 'ficha' | 'produto' | 'servico' | 'pendente'

/** Identidade visual que o admin configura por restaurante. */
export interface Marca {
  logo_url: string | null
  logo_escuro_url: string | null
  favicon_url: string | null
  cor_primaria: string
  cor_secundaria: string
  cor_acento: string
  cor_fundo: string
  cor_superficie: string
  cor_texto: string
  fonte_titulo: string
  fonte_texto: string
  raio_borda: string
  tema: 'claro' | 'escuro'
}

export interface Restaurante extends Marca {
  id: string
  nome: string
  slug: string
  documento: string | null
  unidade: string | null
  ativo: boolean
  moeda: string
  fuso: string
  dia_virada_semana: number
  criado_em: string
  atualizado_em: string
}

export interface Perfil {
  id: string
  restaurante_id: string | null
  nome: string
  email: string
  telefone: string | null
  avatar_url: string | null
  papel: PapelUsuario
  ativo: boolean
  convite_aceito_em: string | null
  ultimo_acesso_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface Categoria {
  id: string
  restaurante_id: string
  nome: string
  descricao: string | null
  cor: string
  ordem: number
  ativo: boolean
  /**
   * `true` = a categoria não é insumo de prato (limpeza, descartável).
   *
   * Ela continua no CMV total e sai do CMV de insumo, que é a decisão que a
   * cliente tomou. Mora na categoria, e não na nota, porque as três pontas do
   * CMV — estoque inicial, compras e estoque final — só têm a categoria em
   * comum: `MATERIAL DE LIMPEZA` e `DESCARTÁVEIS` são contados na folha.
   */
  fora_do_insumo: boolean
  criado_em: string
  atualizado_em: string
}

/** Setor é a mesma forma de Categoria, menos o que só a categoria tem. */
export interface Setor extends Omit<Categoria, 'fora_do_insumo'> {}

/**
 * Estoque de setor: o lugar físico dentro do setor — "Bar / Geladeira 1".
 *
 * É onde se conta, não quanto custa: unidade e custo continuam no vínculo com
 * o setor. Duas geladeiras do mesmo bar guardam a mesma cerveja pelo mesmo
 * preço; o que muda é a parada de quem está contando.
 */
export interface Estoque {
  id: string
  restaurante_id: string
  setor_id: string
  nome: string
  descricao: string | null
  ordem: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface Produto {
  id: string
  restaurante_id: string
  categoria_id: string | null
  nome: string
  codigo: string | null
  codigo_barras: string | null
  unidade: string
  custo_medio: number
  custo_atualizado_em: string | null
  estoque_minimo: number
  perecivel: boolean
  observacao: string | null
  ativo: boolean
  /** O que cabe numa unidade de compra: a garrafa de 965 ML. Nulo = não dito. */
  conteudo_quantidade: number | null
  conteudo_unidade: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

/** Vínculo produto × setor: a unidade e o custo daquele setor. */
export interface ProdutoSetor {
  produto_id: string
  setor_id: string
  unidade: string
  custo: number
  /**
   * `true` = custo calculado pela casa (porção, receita) e que **não** segue
   * nota. Sem essa marca, a primeira nota de tilápia lançada sobrescreveria o
   * custo da porção com o preço do quilo.
   */
  custo_fixo: boolean
  custo_atualizado_em: string | null
  ordem: number
  ativo: boolean
}

export interface SetorDoProduto {
  setor_id: string
  setor_nome: string
  setor_cor: string
  unidade: string
  custo: number
  custo_fixo: boolean
  custo_atualizado_em: string | null
  ordem: number
  /** Os lugares deste setor onde o produto vive. Vazio = o setor inteiro. */
  estoques: { id: string; nome: string }[]
}

/** Linha de vw_produtos_completos. */
export interface ProdutoCompleto extends Omit<Produto, 'categoria_id' | 'criado_por'> {
  categoria_id: string | null
  categoria_nome: string | null
  categoria_cor: string | null
  setores: SetorDoProduto[]
}

/* ────────────────────────────────────────────── módulo 5 · fichas técnicas ── */

export interface Ficha {
  id: string
  restaurante_id: string
  nome: string
  /** Grupo do cardápio: Entradas, Pratos, Sobremesas. Texto livre. */
  grupo: string | null
  descricao: string | null
  modo_preparo: string | null
  /** Quantas porções a receita rende. */
  rendimento: number
  unidade_rendimento: string
  preco_venda: number
  /** A meta de CMV DESTE prato, em percentual. É da casa, não do manual. */
  cmv_alvo: number
  /**
   * Preparação da casa, que entra DENTRO de outra ficha em vez de ser vendida.
   *
   * A coluna existe desde a migração 0022 e a vista sempre a devolveu; o tipo
   * só não a conhecia, então a tela de vendas estava a um `any` de aceitar
   * lançar "massa do empadão" como item de cardápio. O banco recusa por
   * gatilho de qualquer jeito — mas descobrir isso pelo erro do servidor é
   * descobrir tarde.
   */
  producao: boolean
  ativo: boolean
  ordem: number
  criado_em: string
  atualizado_em: string
}

/** Um insumo dentro da ficha, já com a conta feita pelo servidor. */
export interface ItemDaFicha {
  id: string
  produto_id: string
  produto_nome: string
  produto_unidade: string
  categoria_nome: string | null
  categoria_cor: string | null
  /** Quantidade LÍQUIDA, como sai da receita. */
  quantidade: number
  unidade: string
  perda_percentual: number
  /** O que sai do estoque: o líquido mais a perda. */
  quantidade_bruta: number
  custo_unitario: number
  /** Nulo quando a unidade da receita não converte para a de compra. */
  custo: number | null
  unidade_incompativel: boolean
  sem_custo: boolean
  observacao: string | null
  ordem: number
}

export interface FichaCompleta extends Ficha {
  itens: number
  itens_incompativeis: number
  itens_sem_custo: number
  custo_total: number
  custo_porcao: number
  /** Nulo sem preço de venda: a pergunta ainda não tem resposta. */
  cmv_percentual: number | null
  margem: number | null
  markup: number | null
  /** Em quantas fichas esta produção entra. Zero numa ficha de venda. */
  usada_em: number
  itens_da_ficha: ItemDaFicha[]
}

/** O andamento de um setor dentro de uma contagem. */
export interface EntregaDeSetor {
  contagem_id: string
  setor_id: string
  setor_nome: string
  setor_cor: string | null
  setor_ordem: number
  itens: number
  respondidos: number
  pendentes: number
  total: number
  /** Nulo enquanto o setor não foi entregue. */
  entregue_em: string | null
  entregue_por_nome: string | null
}

export interface Contagem {
  id: string
  restaurante_id: string
  referencia: string
  tipo: TipoContagem
  status: StatusContagem
  titulo: string | null
  observacao: string | null
  total: number
  itens_contados: number
  criado_por: string | null
  fechado_por: string | null
  fechada_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface ContagemResumo {
  id: string
  restaurante_id: string
  referencia: string
  tipo: TipoContagem
  status: StatusContagem
  titulo: string | null
  criado_em: string
  fechada_em: string | null
  total: number
  itens_total: number
  itens_preenchidos: number
  criado_por_nome: string | null
  fechado_por_nome: string | null
}

export interface ContagemItem {
  id: string
  contagem_id: string
  produto_id: string
  setor_id: string
  /** null = o setor não tem subdivisão, e a linha vale pelo setor inteiro. */
  estoque_id: string | null
  quantidade: number
  unidade: string
  custo_unitario: number
  total: number
  contado_por: string | null
  contado_em: string | null
  observacao: string | null
}

export interface ContagemPorSetor {
  contagem_id: string
  restaurante_id: string
  setor_id: string
  setor_nome: string
  setor_cor: string
  itens: number
  itens_preenchidos: number
  total: number
}

export interface ContagemPorEstoque {
  contagem_id: string
  restaurante_id: string
  setor_id: string
  setor_nome: string
  setor_cor: string
  estoque_id: string | null
  estoque_nome: string | null
  itens: number
  itens_preenchidos: number
  total: number
  setor_ordem: number
  estoque_ordem: number
}

export interface Fornecedor {
  id: string
  restaurante_id: string
  nome: string
  documento: string | null
  inscricao: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  observacao: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface NotaFiscal {
  id: string
  restaurante_id: string
  fornecedor_id: string | null
  origem: OrigemNota
  status: StatusNota
  chave_acesso: string | null
  numero: string | null
  serie: string | null
  modelo: string | null
  emitida_em: string
  recebida_em: string | null
  valor_produtos: number
  valor_frete: number
  valor_desconto: number
  valor_outros: number
  valor_total: number
  arquivo_url: string | null
  arquivo_nome: string | null
  observacao: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface NotaItem {
  id: string
  nota_id: string
  produto_id: string | null
  descricao: string
  codigo_fornecedor: string | null
  ncm: string | null
  cfop: string | null
  ean: string | null
  unidade: string
  quantidade: number
  valor_unitario: number
  valor_desconto: number
  valor_total: number
  fator_conversao: number
  quantidade_convertida: number
  custo_convertido: number
  /** Operação do ERP, como veio na planilha. É ela que tira limpeza do CMV de insumo. */
  operacao: string | null
  ordem: number
}

export interface CompraHistorico {
  id: string
  restaurante_id: string
  emitida_em: string
  recebida_em: string | null
  numero: string | null
  serie: string | null
  origem: OrigemNota
  status: StatusNota
  valor_total: number
  chave_acesso: string | null
  arquivo_url: string | null
  criado_em: string
  fornecedor_id: string | null
  fornecedor_nome: string
  itens: number
  itens_pendentes: number
}

export interface ListaCompras {
  id: string
  restaurante_id: string
  nome: string
  referencia: string
  status: StatusLista
  observacao: string | null
  total_estimado: number
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface ListaComprasItem {
  id: string
  lista_id: string
  produto_id: string
  setor_id: string | null
  quantidade: number
  unidade: string
  custo_estimado: number
  total_estimado: number
  comprado: boolean
  observacao: string | null
}

/** Retorno de mv_cmv_periodo. */
export interface CmvPeriodo {
  inicio: string
  fim: string
  estoque_inicial: number | null
  estoque_inicial_data: string | null
  estoque_inicial_id: string | null
  compras: number
  compras_notas: number
  estoque_final: number | null
  estoque_final_data: string | null
  estoque_final_id: string | null
  cmv: number | null
  completo: boolean
  pendencia: string | null
  /**
   * `true` quando o estoque final veio da primeira contagem do mês SEGUINTE.
   *
   * Regra da cliente: "mesmo que a contagem do final do mês tenha sido feita no
   * mês seguinte, você irá pegar a primeira contagem do mês seguinte para ser o
   * estoque final". A tela tem de dizer isso e dizer a data — dias de movimento
   * entre o fim do período e a contagem mudam o número.
   */
  estoque_final_fora_do_periodo: boolean
  /** Faturamento das vendas FECHADAS do período. Zero sem venda nenhuma. */
  faturamento: number
  /** O faturamento sem as linhas de serviço: couvert e taxa não consomem insumo. */
  faturamento_produto: number
  faturamento_servico: number
  faturamento_lancamentos: number
  /** `cmv / faturamento`. Nulo sem CMV ou sem faturamento — não se divide por zero. */
  cmv_percentual: number | null
  /** `cmv / faturamento_produto`: o percentual sobre o que de fato consome insumo. */
  cmv_percentual_produto: number | null
  compras_limpeza: number
  estoque_inicial_limpeza: number | null
  estoque_final_limpeza: number | null
  /** `cmv_limpeza + cmv_insumo = cmv`, por construção. */
  cmv_limpeza: number | null
  cmv_insumo: number | null
}

/** Retorno de `mv_faturamento_periodo`. */
export interface FaturamentoPeriodo {
  total: number
  produto: number
  servico: number
  lancamentos: number
  itens: number
}

/** Retorno de mv_cmv_serie. */
export interface CmvSerie {
  rotulo: string
  inicio: string
  fim: string
  estoque_inicial: number | null
  compras: number
  estoque_final: number | null
  cmv: number | null
  completo: boolean
  pendencia: string | null
}

export interface CmvCategoria {
  /** Nulo no balde "Sem categoria" — produto cuja categoria foi apagada. */
  categoria_id: string | null
  categoria_nome: string
  categoria_cor: string
  /** `false` para categoria arquivada que ainda tem movimento no período. */
  categoria_ativa: boolean
  /** Nulo sem contagem de abertura — ver a migração 0007. */
  estoque_inicial: number | null
  compras: number
  /** Nulo sem contagem de fechamento. */
  estoque_final: number | null
  /** Nulo faltando qualquer uma das duas contagens. */
  cmv: number | null
}

/* ───────────────────────────────────────── módulo 2 · vendas e relatório ── */

/**
 * Um lançamento de vendas de um período.
 *
 * `referencia` é o **fim** do período, para casar com `contagens.referencia`:
 * é assim que o relatório pega as vendas que caem entre duas fotos sem ter de
 * adivinhar de que lado a semana fecha.
 */
export interface Venda {
  id: string
  restaurante_id: string
  referencia: string
  /** Pode faltar: o período que vale para a conta é o que há entre duas fotos. */
  inicio: string | null
  titulo: string | null
  status: StatusVenda
  /** `manual` hoje. A coluna existe para a importação de PDV não precisar de migração. */
  origem: OrigemVenda
  origem_arquivo: string | null
  total_itens: number
  total_valor: number
  criado_por: string | null
  fechado_por: string | null
  fechada_em: string | null
  criado_em: string
  atualizado_em: string
}

/**
 * Uma linha de um lançamento de vendas.
 *
 * Ela aponta para UMA das quatro coisas que `alvo` diz (migração 0027): a ficha
 * do cardápio, o insumo direto (garrafa fechada, vendida inteira), o serviço
 * que fatura e não consome nada, ou nada ainda — pendente, que é o único estado
 * que impede fechar o lançamento.
 */
export interface VendaItem {
  id: string
  venda_id: string
  alvo: AlvoDeVenda
  ficha_id: string | null
  produto_id: string | null
  quantidade: number
  /**
   * No lançamento da mão, o preço da ficha congelado. Na importação de PDV, a
   * média do período — a verdade do dinheiro é `valor_total_origem`.
   */
  preco_unitario: number
  total: number
  /**
   * O que o PDV faturou nesta linha, como ele faturou.
   *
   * Existe porque `total` é coluna gerada (`quantidade × preco_unitario`) e
   * nenhum preço unitário de quatro casas reproduz a agregação de um mês no
   * centavo: R$ 16.633,21 em 3.063 unidades volta com onze centavos de erro.
   */
  valor_total_origem: number | null
  /** Quantas linhas de cupom foram somadas nesta. */
  linhas_de_origem: number | null
  /** Texto cru do PDV. É a chave do de-para e o rastro de onde a linha veio. */
  descricao_origem: string | null
  criado_em: string
}

/** Uma linha de `venda_apelidos`: o de-para que o vínculo à mão ensinou. */
export interface VendaApelido {
  id: string
  restaurante_id: string
  apelido: string
  alvo: AlvoDeVenda
  ficha_id: string | null
  produto_id: string | null
  usos: number
  criado_em: string
}

/**
 * Uma linha de `mv_relatorio_de_contagem`.
 *
 *     CONSUMO   = contagem anterior + compras − contagem atual
 *     IDEAL     = contagem anterior + compras − vendas
 *     DIFERENÇA = contagem atual − ideal
 *
 * Toda coluna numérica é anulável porque toda uma delas pode faltar, e a casa
 * prefere a coluna vazia com a `pendencia` escrita a um número plausível e
 * errado. `precisa_comprar` é nulo quando não há venda fechada nenhuma: a
 * pergunta não tem resposta, e responder "não precisa" mandaria a casa para a
 * semana seguinte sem estoque.
 */
export interface LinhaDoRelatorio {
  produto_id: string
  produto_nome: string
  categoria_id: string | null
  categoria_nome: string | null
  unidade: string
  /** Nulo quando não existe contagem fechada anterior. */
  contagem_anterior: number | null
  compras: number | null
  /** Nulo quando algum insumo da venda está sem conversão de unidade. */
  vendas: number | null
  contagem_atual: number | null
  consumo: number | null
  ideal: number | null
  diferenca: number | null
  media_3_vendas: number | null
  /** 1, 2 ou 3 — quantas vendas fechadas entraram na média. */
  vendas_consideradas: number
  sugestao: number | null
  precisa_comprar: boolean | null
  custo_unitario: number
  pendencia: string | null
  /**
   * Este zero é LEITURA, não medida: o produto não estava na folha anterior.
   *
   * A coluna existe porque o número 0 não distinguia "contei e deu zero" de
   * "esta linha não existe na folha", e as duas coisas mandam o gerente para
   * lugares opostos.
   */
  anterior_lido_como_zero: boolean
  /**
   * O mesmo, na folha de AGORA — e aqui não há o álibi "o produto é novo".
   * Quando é verdade, `sugestao` e `precisa_comprar` voltam nulos: recomendar
   * compra em cima de estoque não medido é gastar dinheiro num chute.
   */
  atual_lido_como_zero: boolean
  /**
   * Em quantos dos `vendas_consideradas` lançamentos este insumo de fato saiu.
   *
   * `vendas_consideradas` sozinho dizia "3" tanto para o insumo que saiu nos
   * três quanto para o que saiu em um, e a tela não tinha como mostrar a
   * diferença — que é justamente o que separa "item parado" de "item que
   * acabou de entrar no cardápio".
   */
  vendas_com_saida: number
}

/** Uma linha de `mv_vendas_por_produto`: o que um lançamento tirou do estoque. */
export interface VendaPorProduto {
  produto_id: string
  /** Nulo quando o insumo está sem conversão — nunca zero fingindo leitura. */
  quantidade: number | null
  fator_ausente: boolean
  motivo: string | null
}

/**
 * Procedência de uma contagem: só o que o banco sabe de fato.
 *
 * `fichas.origem_carga` não se aplica aqui — contagem nasce da folha e é
 * preenchida à mão, não de arquivo. Então o rodapé do dashboard afirma o que
 * dá para afirmar: aberta ou fechada, quem fechou, quando, quantas abas.
 */
export interface ContagemProcedencia {
  contagem_id: string
  restaurante_id: string
  referencia: string
  tipo: TipoContagem
  status: StatusContagem
  titulo: string | null
  criado_em: string
  fechada_em: string | null
  criado_por_nome: string | null
  fechado_por_nome: string | null
  itens_na_folha: number
  /** Carimbo OU quantidade. Mantido como estava, para quem já o lê. */
  itens_respondidos: number
  /** Linhas com `contado_em`. Numa folha vinda de carga, é zero — inclusive
   *  nas linhas preenchidas. */
  itens_com_carimbo: number
  /** Linhas com quantidade maior que zero. */
  itens_com_quantidade: number
  setores: number
  abas: number
  categorias: number
}

export interface PanoramaRestaurante {
  id: string
  nome: string
  slug: string
  unidade: string | null
  ativo: boolean
  logo_url: string | null
  cor_primaria: string
  criado_em: string
  usuarios: number
  produtos: number
  setores: number
  categorias: number
  contagens: number
  ultima_contagem: string | null
  valor_estoque: number | null
  ultimo_acesso: string | null
}

/**
 * Convite: quem pode ser o quê, decidido **antes** do cadastro por quem já
 * tinha esse poder. Sem convite, a conta existe no auth e não ganha perfil —
 * e sem perfil não enxerga linha nenhuma (migração 0008).
 */
export interface Convite {
  id: string
  restaurante_id: string | null
  email: string
  nome: string | null
  /** Só dígitos, com DDI. A tela monta o link do WhatsApp a partir dele. */
  telefone: string | null
  papel: PapelUsuario
  criado_por: string | null
  criado_em: string
  expira_em: string
  aceito_em: string | null
  aceito_por: string | null
}
