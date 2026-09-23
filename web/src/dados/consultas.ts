/**
 * Acesso ao Supabase, um hook por pergunta que a interface faz.
 *
 * Regra do arquivo: nenhuma tela monta query solta. Tudo passa por aqui, para
 * que chave de cache, invalidação e tratamento de erro sejam um só.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  Categoria,
  Convite,
  CmvCategoria,
  CmvPeriodo,
  CmvSerie,
  CompraHistorico,
  Contagem,
  ContagemItem,
  ContagemPorEstoque,
  ContagemPorSetor,
  ContagemResumo,
  Estoque,
  Fornecedor,
  ListaCompras,
  ListaComprasItem,
  NotaItem,
  PanoramaRestaurante,
  PapelUsuario,
  Perfil,
  Produto,
  ProdutoCompleto,
  Restaurante,
  Setor,
  StatusLista,
  TipoContagem,
} from '@/tipos/banco'

/** Erro do PostgREST vira mensagem legível em português. */
function erro(e: { message: string; code?: string } | null): never | void {
  if (!e) return
  const traducao: Record<string, string> = {
    '23505': 'Já existe um registro com esse nome ou código.',
    '23503': 'Este registro está em uso e não pode ser removido.',
    '42501': 'Você não tem permissão para esta operação.',
  }
  throw new Error(traducao[e.code ?? ''] ?? e.message)
}

async function buscar<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await consulta
  erro(error as { message: string; code?: string } | null)
  return data as T
}

/**
 * Teto do PostgREST: sem `.range()`, o Supabase devolve no maximo 1000 linhas —
 * e devolve **calado**. O primeiro cliente ja tem 854 produtos e 868 itens de
 * contagem; a 15% do teto, a proxima folha de contagem seria truncada sem erro
 * nenhum na tela, e o total somado no navegador sairia menor que a soma dos
 * cartoes de setor (esses vem agregados do servidor e estariam certos).
 *
 * Esta funcao pagina ate acabar. O limite de seguranca existe para que um
 * defeito de filtro nao vire um download de banco inteiro.
 */
const PAGINA = 1000
const TETO_DE_SEGURANCA = 50_000

async function buscarTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const tudo: T[] = []
  for (let de = 0; de < TETO_DE_SEGURANCA; de += PAGINA) {
    const lote = await buscar<T[]>(pagina(de, de + PAGINA - 1))
    tudo.push(...lote)
    if (lote.length < PAGINA) return tudo
  }
  throw new Error(
    `A consulta passou de ${TETO_DE_SEGURANCA} linhas. Isso quase certamente e um filtro errado, e nao um catalogo desse tamanho.`,
  )
}

export const chaves = {
  restaurantes: ['restaurantes'] as const,
  panorama: ['panorama'] as const,
  equipe: (r: string) => ['equipe', r] as const,
  convites: (r: string) => ['convites', r] as const,
  categorias: (r: string) => ['categorias', r] as const,
  setores: (r: string) => ['setores', r] as const,
  estoques: (r: string) => ['estoques', r] as const,
  produtos: (r: string) => ['produtos', r] as const,
  contagens: (r: string) => ['contagens', r] as const,
  contagem: (id: string) => ['contagem', id] as const,
  contagemItens: (id: string) => ['contagem-itens', id] as const,
  contagemSetores: (id: string) => ['contagem-setores', id] as const,
  contagemEstoques: (id: string) => ['contagem-estoques', id] as const,
  fornecedores: (r: string) => ['fornecedores', r] as const,
  compras: (r: string) => ['compras', r] as const,
  notaItens: (id: string) => ['nota-itens', id] as const,
  listas: (r: string) => ['listas', r] as const,
  listaItens: (id: string) => ['lista-itens', id] as const,
  produtosPorCategoria: (r: string) => ['produtos-por-categoria', r] as const,
  cmv: (r: string, i: string, f: string) => ['cmv', r, i, f] as const,
  cmvSerie: (r: string, g: string, n: number) => ['cmv-serie', r, g, n] as const,
  // Sob o prefixo 'cmv' de proposito: as mutacoes invalidam por prefixo, e
  // 'cmv-cat' era uma chave irma que nunca era atingida — a tabela por
  // categoria ficava velha ao lado dos indicadores recem-atualizados.
  cmvCategorias: (r: string, i: string, f: string) => ['cmv', 'categorias', r, i, f] as const,
}

// ─────────────────────────────────────────────────────── administração ─────

export function usePanorama(): UseQueryResult<PanoramaRestaurante[]> {
  return useQuery({
    queryKey: chaves.panorama,
    queryFn: () =>
      buscar<PanoramaRestaurante[]>(
        supabase.from('vw_panorama_restaurantes').select('*').order('nome'),
      ),
  })
}

export function useEquipe(restauranteId: string | null) {
  return useQuery({
    queryKey: chaves.equipe(restauranteId ?? 'rede'),
    enabled: true,
    queryFn: () => {
      const q = supabase.from('perfis').select('*').order('nome')
      return buscar<Perfil[]>(restauranteId ? q.eq('restaurante_id', restauranteId) : q)
    },
  })
}

export function useSalvarRestaurante() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Partial<Restaurante> & { id?: string }) => {
      const { id, ...resto } = dados
      const consulta = id
        ? supabase.from('restaurantes').update(resto).eq('id', id).select().single()
        : supabase.from('restaurantes').insert(resto).select().single()
      return buscar<Restaurante>(consulta)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.restaurantes })
      void qc.invalidateQueries({ queryKey: chaves.panorama })
    },
  })
}

// ──────────────────────────────────────────────────────────── convites ─────

/**
 * Convites pendentes. Quem não administra não enxerga nenhum — a política de
 * leitura é restrita de propósito: convite diz quem está sendo contratado e
 * com que poder, e isso não é assunto de operador.
 */
export function useConvites(restauranteId: string | null) {
  return useQuery({
    queryKey: chaves.convites(restauranteId ?? 'rede'),
    queryFn: () => {
      const q = supabase
        .from('convites')
        .select('*')
        .is('aceito_em', null)
        .order('criado_em', { ascending: false })
      return buscar<Convite[]>(restauranteId ? q.eq('restaurante_id', restauranteId) : q)
    },
  })
}

export function useConvidar(restauranteId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: {
      email: string
      papel: PapelUsuario
      nome?: string
      telefone?: string
      restauranteId?: string
    }) =>
      buscar<Convite>(
        supabase.rpc('mv_convidar', {
          p_email: dados.email.trim().toLowerCase(),
          p_papel: dados.papel,
          p_restaurante: dados.restauranteId ?? restauranteId,
          p_nome: dados.nome ?? null,
          p_telefone: dados.telefone ?? null,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convites'] }),
  })
}

export function useCancelarConvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => buscar(supabase.from('convites').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convites'] }),
  })
}

export interface UsuarioExcluido {
  excluido: { id: string; nome: string; email: string }
  aviso: string
}

/**
 * Exclui de verdade: a conta some do `auth`, e o perfil vai junto no cascade.
 *
 * Passa pela edge function porque apagar do `auth` exige a `service_role`, que
 * não pode viver no navegador. Apagar só a linha de `perfis` daqui deixaria a
 * conta viva: a pessoa continuaria entrando, cairia em "sua conta existe mas
 * ainda não tem acesso", e não poderia ser convidada de novo — o gatilho que
 * transforma convite em perfil só dispara quando a conta NASCE.
 */
export function useExcluirUsuario(restauranteId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const { data, error } = await supabase.functions.invoke('remover-usuario', {
        body: { usuarioId },
      })
      if (error) {
        // O supabase-js não entrega o corpo quando o status não é 2xx: ele
        // embrulha a Response em `error.context`. Sem abrir, sobra "non-2xx
        // status code", que não diz por que a exclusão foi recusada.
        const resposta = (error as { context?: unknown }).context
        if (resposta instanceof Response) {
          const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null
          throw new Error(corpo?.erro ?? error.message)
        }
        throw new Error(error.message)
      }
      return data as UsuarioExcluido
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.equipe(restauranteId ?? 'rede') })
      void qc.invalidateQueries({ queryKey: ['convites'] })
    },
  })
}

export function useSalvarPerfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: Partial<Perfil> & { id: string }) =>
      buscar<Perfil>(
        supabase.from('perfis').update(dados).eq('id', dados.id).select().single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipe'] }),
  })
}

// ────────────────────────────────────────────── módulo 1 · cadastros ────────

export function useCategorias(restauranteId: string) {
  return useQuery({
    queryKey: chaves.categorias(restauranteId),
    queryFn: () =>
      buscar<Categoria[]>(
        supabase
          .from('categorias')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('ordem')
          .order('nome'),
      ),
  })
}

export function useSetores(restauranteId: string) {
  return useQuery({
    queryKey: chaves.setores(restauranteId),
    queryFn: () =>
      buscar<Setor[]>(
        supabase
          .from('setores')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('ordem')
          .order('nome'),
      ),
  })
}

/**
 * Os estoques de setor do restaurante inteiro, numa consulta só.
 *
 * Uma por setor seria uma cascata de consultas em toda tela que mostra
 * produto. São dezenas de linhas no total — o agrupamento por setor sai de
 * graça no cliente.
 */
export function useEstoques(restauranteId: string) {
  return useQuery({
    queryKey: chaves.estoques(restauranteId),
    queryFn: () =>
      buscar<Estoque[]>(
        supabase
          .from('estoques')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('ordem')
          .order('nome'),
      ),
  })
}

/**
 * Põe (ou tira) de uma vez todos os produtos de um estoque de setor.
 *
 * Sem isto, encher a "Câmara fria" com os 455 produtos da Cozinha exigiria
 * abrir produto por produto — 455 painéis, 455 salvamentos. O cadastro
 * existente ficaria eternamente fora dos lugares, e o recurso inteiro viraria
 * enfeite para quem já tem catálogo.
 *
 * Reconcilia por diferença em vez de apagar e reinserir: quem já estava no
 * lugar não sai e volta, e a ordem de quem ficou é preservada.
 */
export function useProdutosDoEstoque(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: { estoqueId: string; produtos: string[] }) => {
      const desejados = new Set(entrada.produtos)

      const atuais = await buscarTudo<{ produto_id: string }>((de, ate) =>
        supabase
          .from('produto_estoques')
          .select('produto_id')
          .eq('estoque_id', entrada.estoqueId)
          .order('produto_id')
          .range(de, ate),
      )
      const tinha = new Set(atuais.map((a) => a.produto_id))
      const tirar = [...tinha].filter((id) => !desejados.has(id))
      const por = [...desejados].filter((id) => !tinha.has(id))

      if (tirar.length > 0) {
        await buscar(
          supabase
            .from('produto_estoques')
            .delete()
            .eq('estoque_id', entrada.estoqueId)
            .in('produto_id', tirar),
        )
      }
      if (por.length > 0) {
        // Em lotes: 455 linhas numa requisição só é pedido grande demais para
        // uma conexão de celular no meio do salão.
        const LOTE = 200
        for (let i = 0; i < por.length; i += LOTE) {
          await buscar(
            supabase.from('produto_estoques').insert(
              por.slice(i, i + LOTE).map((produto_id, j) => ({
                produto_id,
                estoque_id: entrada.estoqueId,
                ordem: i + j,
              })),
            ),
          )
        }
      }
      return { adicionados: por.length, removidos: tirar.length }
    },
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

export function useSalvarEstoque(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: Partial<Estoque> & { id?: string }) => {
      const { id, ...resto } = dados
      return buscar<Estoque>(
        id
          ? supabase.from('estoques').update(resto).eq('id', id).select().single()
          : supabase
              .from('estoques')
              .insert({ ...resto, restaurante_id: restauranteId })
              .select()
              .single(),
      )
    },
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

export function useProdutos(restauranteId: string) {
  return useQuery({
    queryKey: chaves.produtos(restauranteId),
    queryFn: () =>
      buscarTudo<ProdutoCompleto>((de, ate) =>
        supabase
          .from('vw_produtos_completos')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('nome')
          .range(de, ate),
      ),
  })
}

function invalidarCadastros(qc: ReturnType<typeof useQueryClient>, r: string) {
  void qc.invalidateQueries({ queryKey: chaves.produtos(r) })
  void qc.invalidateQueries({ queryKey: chaves.categorias(r) })
  void qc.invalidateQueries({ queryKey: chaves.setores(r) })
  void qc.invalidateQueries({ queryKey: chaves.estoques(r) })
}

export function useSalvarCategoria(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: Partial<Categoria> & { id?: string }) => {
      const { id, ...resto } = dados
      return buscar<Categoria>(
        id
          ? supabase.from('categorias').update(resto).eq('id', id).select().single()
          : supabase
              .from('categorias')
              .insert({ ...resto, restaurante_id: restauranteId })
              .select()
              .single(),
      )
    },
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

export function useSalvarSetor(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: Partial<Setor> & { id?: string }) => {
      const { id, ...resto } = dados
      return buscar<Setor>(
        id
          ? supabase.from('setores').update(resto).eq('id', id).select().single()
          : supabase
              .from('setores')
              .insert({ ...resto, restaurante_id: restauranteId })
              .select()
              .single(),
      )
    },
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

export interface VinculoSetor {
  setor_id: string
  unidade: string
  custo: number
  /**
   * `true` = custo calculado pela casa e que não segue nota fiscal. Sem isso, a
   * primeira nota de tilápia lançada sobrescreveria o custo da porção nos
   * Porcionados com o preço do quilo do Estoque Geral.
   */
  custo_fixo: boolean
  /**
   * Ids dos estoques deste setor onde o produto vive. Vazio = o setor inteiro,
   * que é o caso dos 854 produtos vindos da planilha: ela não tem esse nível.
   */
  estoques: string[]
}

/**
 * Salva o produto e os setores dele numa tacada. Os vínculos são reescritos
 * por diferença — apagar tudo e reinserir derrubaria histórico de ordem.
 */
export function useSalvarProduto(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: {
      produto: Partial<Produto> & { id?: string }
      setores: VinculoSetor[]
    }) => {
      const { id, ...resto } = entrada.produto
      const produto = await buscar<Produto>(
        id
          ? supabase.from('produtos').update(resto).eq('id', id).select().single()
          : supabase
              .from('produtos')
              .insert({ ...resto, restaurante_id: restauranteId })
              .select()
              .single(),
      )

      const atuais = await buscar<{ setor_id: string }[]>(
        supabase.from('produto_setores').select('setor_id').eq('produto_id', produto.id),
      )
      const desejados = new Set(entrada.setores.map((s) => s.setor_id))
      const remover = atuais.map((a) => a.setor_id).filter((s) => !desejados.has(s))

      if (remover.length > 0) {
        await buscar(
          supabase
            .from('produto_setores')
            .delete()
            .eq('produto_id', produto.id)
            .in('setor_id', remover),
        )
      }
      if (entrada.setores.length > 0) {
        await buscar(
          supabase.from('produto_setores').upsert(
            // `estoques` e campo desta camada, nao coluna: mandar junto faria o
            // PostgREST recusar a linha inteira por coluna desconhecida.
            entrada.setores.map(({ estoques: _lugares, ...s }, i) => ({
              ...s,
              produto_id: produto.id,
              ordem: i,
            })),
            { onConflict: 'produto_id,setor_id' },
          ),
        )
      }

      // Os lugares vem depois dos setores de proposito: o banco recusa pendurar
      // o produto na Geladeira 1 antes de ele estar no Bar. Sair do setor ja
      // limpa os lugares daquele setor por gatilho, entao aqui so sobra
      // reconciliar o que o formulario marcou e desmarcou.
      const lugaresDesejados = new Set(entrada.setores.flatMap((s) => s.estoques))
      const lugaresAtuais = await buscar<{ estoque_id: string }[]>(
        supabase.from('produto_estoques').select('estoque_id').eq('produto_id', produto.id),
      )
      const tinha = new Set(lugaresAtuais.map((l) => l.estoque_id))
      const tirar = [...tinha].filter((id) => !lugaresDesejados.has(id))
      const por = [...lugaresDesejados].filter((id) => !tinha.has(id))

      if (tirar.length > 0) {
        await buscar(
          supabase
            .from('produto_estoques')
            .delete()
            .eq('produto_id', produto.id)
            .in('estoque_id', tirar),
        )
      }
      if (por.length > 0) {
        await buscar(
          supabase
            .from('produto_estoques')
            .insert(por.map((estoque_id, i) => ({ produto_id: produto.id, estoque_id, ordem: i }))),
        )
      }

      return produto
    },
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

export function useArquivarProduto(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { id: string; ativo: boolean }) =>
      buscar<Produto>(
        supabase
          .from('produtos')
          .update({ ativo: entrada.ativo })
          .eq('id', entrada.id)
          .select()
          .single(),
      ),
    onSuccess: () => invalidarCadastros(qc, restauranteId),
  })
}

// ───────────────────────────────────────────── módulo 2 · contagem ─────────

export function useContagens(restauranteId: string) {
  return useQuery({
    queryKey: chaves.contagens(restauranteId),
    queryFn: () =>
      buscar<ContagemResumo[]>(
        supabase
          .from('vw_contagens_resumo')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('referencia', { ascending: false }),
      ),
  })
}

export function useContagem(contagemId: string | undefined) {
  return useQuery({
    queryKey: chaves.contagem(contagemId ?? ''),
    enabled: Boolean(contagemId),
    queryFn: () =>
      buscar<Contagem>(
        supabase.from('contagens').select('*').eq('id', contagemId!).single(),
      ),
  })
}

export interface ItemDeContagem extends ContagemItem {
  produto: { nome: string; categoria_id: string | null } | null
}

export function useItensDaContagem(contagemId: string | undefined) {
  return useQuery({
    queryKey: chaves.contagemItens(contagemId ?? ''),
    enabled: Boolean(contagemId),
    queryFn: () =>
      buscarTudo<ItemDeContagem>((de, ate) =>
        supabase
          .from('contagem_itens')
          .select('*, produto:produtos(nome, categoria_id)')
          .eq('contagem_id', contagemId!)
          .order('id')
          .range(de, ate),
      ),
  })
}

/**
 * Totais por lugar dentro da contagem. O setor sem subdivisão vem com
 * `estoque_id` nulo — uma linha só, que é a tela de antes dos estoques.
 */
export function useTotaisPorEstoque(contagemId: string | undefined) {
  return useQuery({
    queryKey: chaves.contagemEstoques(contagemId ?? ''),
    enabled: Boolean(contagemId),
    queryFn: () =>
      buscar<ContagemPorEstoque[]>(
        supabase
          .from('vw_contagem_por_estoque')
          .select('*')
          .eq('contagem_id', contagemId!)
          // Pela ordem dos setores, nao pelo nome: e a ordem em que se anda
          // pela casa, e quem a define e o admin na tela de Setores.
          .order('setor_ordem')
          .order('setor_nome')
          .order('estoque_ordem')
          .order('estoque_nome'),
      ),
  })
}

export function useTotaisPorSetor(contagemId: string | undefined) {
  return useQuery({
    queryKey: chaves.contagemSetores(contagemId ?? ''),
    enabled: Boolean(contagemId),
    queryFn: () =>
      buscar<ContagemPorSetor[]>(
        supabase
          .from('vw_contagem_por_setor')
          .select('*')
          .eq('contagem_id', contagemId!)
          .order('setor_nome'),
      ),
  })
}

export function useAbrirContagem(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: {
      referencia: string
      tipo: TipoContagem
      titulo?: string
      setores?: string[]
    }) =>
      buscar<string>(
        supabase.rpc('mv_abrir_contagem', {
          p_restaurante: restauranteId,
          p_referencia: entrada.referencia,
          p_tipo: entrada.tipo,
          p_titulo: entrada.titulo ?? null,
          p_setores: entrada.setores ?? null,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.contagens(restauranteId) }),
  })
}

/** Lançar quantidade item a item. O total é coluna gerada — não mandamos. */
export function useLancarQuantidade(contagemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { itemId: string; quantidade: number }) =>
      buscar<ContagemItem>(
        supabase
          .from('contagem_itens')
          .update({
            quantidade: entrada.quantidade,
            contado_em: new Date().toISOString(),
          })
          .eq('id', entrada.itemId)
          .select()
          .single(),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.contagemItens(contagemId) })
      void qc.invalidateQueries({ queryKey: chaves.contagemSetores(contagemId) })
    },
  })
}

export interface ResultadoDoRefazer {
  acrescentadas: number
  removidas: number
  preservadas: number
}

/**
 * Realinha a folha aberta com o cadastro de hoje.
 *
 * A folha é uma foto do cadastro no instante da abertura — de propósito, para
 * que mexer no cadastro não mude uma contagem em andamento por baixo. O preço
 * disso aparece quando o cadastro muda de verdade: foi o que deixou a folha
 * do Bar do Zeca mostrando quatro setores que não existem mais.
 */
export function useRefazerFolha(contagemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const linhas = await buscar<ResultadoDoRefazer[]>(
        supabase.rpc('mv_refazer_folha', { p_contagem: contagemId }),
      )
      const resultado = linhas[0]
      if (!resultado) throw new Error('a folha respondeu sem resultado')
      return resultado
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.contagemItens(contagemId) })
      void qc.invalidateQueries({ queryKey: chaves.contagemEstoques(contagemId) })
      void qc.invalidateQueries({ queryKey: chaves.contagemSetores(contagemId) })
    },
  })
}

export function useFecharContagem(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contagemId: string) =>
      buscar<Contagem>(supabase.rpc('mv_fechar_contagem', { p_contagem: contagemId })),
    onSuccess: (_d, contagemId) => {
      void qc.invalidateQueries({ queryKey: chaves.contagens(restauranteId) })
      void qc.invalidateQueries({ queryKey: chaves.contagem(contagemId) })
      void qc.invalidateQueries({ queryKey: ['cmv'] })
      void qc.invalidateQueries({ queryKey: ['cmv-serie'] })
      // A rede mostra o valor do estoque da ultima contagem fechada: fechar uma
      // muda aquele numero.
      void qc.invalidateQueries({ queryKey: chaves.panorama })
    },
  })
}

export function useReabrirContagem(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contagemId: string) =>
      buscar<Contagem>(supabase.rpc('mv_reabrir_contagem', { p_contagem: contagemId })),
    onSuccess: (_d, contagemId) => {
      void qc.invalidateQueries({ queryKey: chaves.contagens(restauranteId) })
      void qc.invalidateQueries({ queryKey: chaves.contagem(contagemId) })
    },
  })
}

// ────────────────────────────────────────────── módulo 3 · compras ─────────

export function useFornecedores(restauranteId: string) {
  return useQuery({
    queryKey: chaves.fornecedores(restauranteId),
    queryFn: () =>
      buscar<Fornecedor[]>(
        supabase
          .from('fornecedores')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('nome'),
      ),
  })
}

export function useCompras(restauranteId: string) {
  return useQuery({
    queryKey: chaves.compras(restauranteId),
    queryFn: () =>
      buscar<CompraHistorico[]>(
        supabase
          .from('vw_compras_historico')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('emitida_em', { ascending: false }),
      ),
  })
}

export interface ItemDeNota extends NotaItem {
  produto: { nome: string } | null
}

export function useItensDaNota(notaId: string | undefined) {
  return useQuery({
    queryKey: chaves.notaItens(notaId ?? ''),
    enabled: Boolean(notaId),
    queryFn: () =>
      buscar<ItemDeNota[]>(
        supabase
          .from('nota_itens')
          .select('*, produto:produtos(nome)')
          .eq('nota_id', notaId!)
          .order('ordem'),
      ),
  })
}

export function useVincularItemDaNota(notaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { itemId: string; produtoId: string | null; fator?: number }) =>
      buscar<NotaItem>(
        supabase
          .from('nota_itens')
          .update({
            produto_id: entrada.produtoId,
            ...(entrada.fator !== undefined ? { fator_conversao: entrada.fator } : {}),
          })
          .eq('id', entrada.itemId)
          .select()
          .single(),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.notaItens(notaId) })
      // O historico mostra "N itens pendentes" por nota: vincular o ultimo
      // muda o cracha da lista, que fica noutra tela.
      void qc.invalidateQueries({ queryKey: ['compras'] })
    },
  })
}

export function useLancarNota(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (notaId: string) =>
      buscar(supabase.rpc('mv_lancar_nota', { p_nota: notaId })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.compras(restauranteId) })
      void qc.invalidateQueries({ queryKey: chaves.produtos(restauranteId) })
      void qc.invalidateQueries({ queryKey: ['cmv'] })
      void qc.invalidateQueries({ queryKey: ['cmv-serie'] })
    },
  })
}

export function useListasDeCompras(restauranteId: string) {
  return useQuery({
    queryKey: chaves.listas(restauranteId),
    queryFn: () =>
      buscar<ListaCompras[]>(
        supabase
          .from('listas_compras')
          .select('*')
          .eq('restaurante_id', restauranteId)
          .order('referencia', { ascending: false })
          // `referencia` e uma data: duas folhas do mesmo dia empatam e a ordem
          // vira a que o Postgres quiser. Sem este desempate, "a lista mais
          // recente" que a tela abre sozinha nao e a ultima que a pessoa criou.
          .order('criado_em', { ascending: false }),
      ),
  })
}

export interface ItemDeLista extends ListaComprasItem {
  produto: { nome: string; categoria_id: string | null } | null
}

export function useItensDaLista(listaId: string | undefined) {
  return useQuery({
    queryKey: chaves.listaItens(listaId ?? ''),
    enabled: Boolean(listaId),
    queryFn: () =>
      buscarTudo<ItemDeLista>((de, ate) =>
        supabase
          .from('lista_compras_itens')
          .select('*, produto:produtos(nome, categoria_id)')
          .eq('lista_id', listaId!)
          .order('id')
          .range(de, ate),
      ),
  })
}

/**
 * Quantos produtos ativos cada categoria tem.
 *
 * Existe para que a tela de gerar diga, no proprio chip, que marcar APARAS
 * significa uma folha de 7 produtos e nao do cadastro inteiro. Traz so a
 * coluna da categoria — e uma contagem, nao o catalogo.
 */
export function useProdutosPorCategoria(
  restauranteId: string,
): UseQueryResult<ReadonlyMap<string | null, number>> {
  return useQuery({
    queryKey: chaves.produtosPorCategoria(restauranteId),
    queryFn: async () => {
      const linhas = await buscarTudo<{ categoria_id: string | null }>((de, ate) =>
        supabase
          .from('produtos')
          .select('categoria_id')
          .eq('restaurante_id', restauranteId)
          .eq('ativo', true)
          .order('id')
          .range(de, ate),
      )
      const contagem = new Map<string | null, number>()
      for (const linha of linhas) {
        contagem.set(linha.categoria_id, (contagem.get(linha.categoria_id) ?? 0) + 1)
      }
      return contagem
    },
  })
}

/**
 * Fecha (ou cancela) a folha.
 *
 * Sem isto a folha de compras nunca acaba: a tela abre sozinha a mais recente
 * que ainda esteja em andamento, e uma folha em andamento para sempre e uma
 * folha da qual nao se sai.
 */
export function useEncerrarLista(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { listaId: string; status: StatusLista }) =>
      buscar<ListaCompras>(
        supabase
          .from('listas_compras')
          .update({ status: entrada.status })
          .eq('id', entrada.listaId)
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.listas(restauranteId) }),
  })
}

export function useGerarListaDeCompras(restauranteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { nome?: string; categorias?: string[] }) =>
      buscar<string>(
        supabase.rpc('mv_gerar_lista_compras', {
          p_restaurante: restauranteId,
          p_nome: entrada.nome ?? null,
          p_categorias: entrada.categorias ?? null,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.listas(restauranteId) }),
  })
}

export function useLancarItemDaLista(listaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entrada: { itemId: string; quantidade: number }) =>
      buscar<ListaComprasItem>(
        supabase
          .from('lista_compras_itens')
          .update({ quantidade: entrada.quantidade })
          .eq('id', entrada.itemId)
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chaves.listaItens(listaId) }),
  })
}

// ─────────────────────────────────────────────── módulo 4 · CMV ────────────

export function useCmv(restauranteId: string, inicio: string, fim: string) {
  return useQuery({
    queryKey: chaves.cmv(restauranteId, inicio, fim),
    queryFn: async () => {
      const linhas = await buscar<CmvPeriodo[]>(
        supabase.rpc('mv_cmv_periodo', {
          p_restaurante: restauranteId,
          p_inicio: inicio,
          p_fim: fim,
        }),
      )
      return linhas[0] ?? null
    },
  })
}

export function useCmvSerie(
  restauranteId: string,
  granularidade: 'semanal' | 'mensal',
  periodos = 6,
) {
  return useQuery({
    queryKey: chaves.cmvSerie(restauranteId, granularidade, periodos),
    queryFn: () =>
      buscar<CmvSerie[]>(
        supabase.rpc('mv_cmv_serie', {
          p_restaurante: restauranteId,
          p_granularidade: granularidade,
          p_periodos: periodos,
        }),
      ),
  })
}

export function useCmvPorCategoria(restauranteId: string, inicio: string, fim: string) {
  return useQuery({
    queryKey: chaves.cmvCategorias(restauranteId, inicio, fim),
    queryFn: () =>
      buscar<CmvCategoria[]>(
        supabase.rpc('mv_cmv_por_categoria', {
          p_restaurante: restauranteId,
          p_inicio: inicio,
          p_fim: fim,
        }),
      ),
  })
}
