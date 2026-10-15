/**
 * As contas de "o que mudou neste insumo", fora da camada de rede.
 *
 * Elas moram aqui, e não dentro da mutação, por um motivo medido: salvar um
 * insumo custava **dez** idas ao servidor, e nove delas eram para descobrir ou
 * reconferir coisas que a tela já sabia. A regra de quais vínculos apagar,
 * quais regravar e quais deixar em paz passou a decidir rede — e regra que
 * decide rede merece teste próprio, não inspeção visual.
 */
import type { ProdutoCompleto, SetorDoProduto } from '@/tipos/banco'

/** Um setor marcado no formulário, com a unidade e o custo daquele setor. */
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

/** Uma linha de `produto_setores` pronta para o upsert, já com a ordem. */
export interface VinculoParaGravar extends Omit<VinculoSetor, 'estoques'> {
  ordem: number
}

export interface ReconciliacaoDeVinculos {
  /** Setores que o formulário desmarcou. */
  removerSetores: string[]
  /** Só os setores que de fato mudaram — regravar os outros é rede à toa. */
  gravarSetores: VinculoParaGravar[]
  /** Lugares desmarcados. */
  removerLugares: string[]
  /** Lugares marcados que ainda não existiam. */
  gravarLugares: string[]
}

/**
 * O que precisa ir ao servidor, comparando a linha que o formulário abriu com
 * o que ele devolveu.
 *
 * `anteriores` vem da vista, não de um `select` novo. Isso poupa duas idas ao
 * servidor e, de quebra, é mais gentil com duas pessoas editando ao mesmo
 * tempo: o save só apaga o que *este* formulário tinha na mão e desmarcou, em
 * vez de apagar um setor que a outra pessoa acabou de marcar.
 */
export function reconciliarVinculos(
  anteriores: readonly SetorDoProduto[],
  desejados: readonly VinculoSetor[],
): ReconciliacaoDeVinculos {
  const marcados = new Set(desejados.map((s) => s.setor_id))
  const removerSetores = anteriores.map((a) => a.setor_id).filter((s) => !marcados.has(s))

  const gravarSetores: VinculoParaGravar[] = []
  desejados.forEach(({ estoques: _lugares, ...vinculo }, ordem) => {
    const antes = anteriores.find((a) => a.setor_id === vinculo.setor_id)
    const igual =
      antes !== undefined &&
      antes.unidade === vinculo.unidade &&
      Number(antes.custo) === Number(vinculo.custo) &&
      antes.custo_fixo === vinculo.custo_fixo &&
      antes.ordem === ordem
    if (!igual) gravarSetores.push({ ...vinculo, ordem })
  })

  const lugaresMarcados = new Set(desejados.flatMap((s) => s.estoques))
  const lugaresDeAntes = new Set(anteriores.flatMap((s) => (s.estoques ?? []).map((e) => e.id)))
  const removerLugares = [...lugaresDeAntes].filter((e) => !lugaresMarcados.has(e))
  const gravarLugares = [...lugaresMarcados].filter((e) => !lugaresDeAntes.has(e))

  return { removerSetores, gravarSetores, removerLugares, gravarLugares }
}

/**
 * Troca (ou insere) uma linha na lista do cache, na ordem por nome que o
 * servidor usa. A tela reordena do jeito dela depois; isto é só para um insumo
 * recém-cadastrado não aparecer no fim da lista.
 */
export function costurarProduto(
  antigas: readonly ProdutoCompleto[],
  linha: ProdutoCompleto,
): ProdutoCompleto[] {
  const i = antigas.findIndex((p) => p.id === linha.id)
  if (i >= 0) {
    const copia = [...antigas]
    copia[i] = linha
    return copia
  }
  const lugar = antigas.findIndex((p) => p.nome.localeCompare(linha.nome, 'pt-BR') > 0)
  return lugar < 0
    ? [...antigas, linha]
    : [...antigas.slice(0, lugar), linha, ...antigas.slice(lugar)]
}
