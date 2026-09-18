/**
 * Tipos do banco — espelho fiel das migrações em supabase/migrations.
 * Mudou o SQL? Mude aqui na mesma leva.
 */

export type PapelUsuario = 'master' | 'admin' | 'gerente' | 'operador'
export type TipoContagem = 'semanal' | 'mensal' | 'avulsa'
export type StatusContagem = 'aberta' | 'fechada' | 'cancelada'
export type OrigemNota = 'xml' | 'pdf' | 'manual'
export type StatusNota = 'importada' | 'conferida' | 'lancada' | 'cancelada'
export type StatusLista = 'rascunho' | 'enviada' | 'concluida' | 'cancelada'

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
  criado_em: string
  atualizado_em: string
}

export interface Setor extends Omit<Categoria, never> {}

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
}

/** Linha de vw_produtos_completos. */
export interface ProdutoCompleto extends Omit<Produto, 'categoria_id' | 'criado_por'> {
  categoria_id: string | null
  categoria_nome: string | null
  categoria_cor: string | null
  setores: SetorDoProduto[]
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
  papel: PapelUsuario
  criado_por: string | null
  criado_em: string
  expira_em: string
  aceito_em: string | null
  aceito_por: string | null
}
