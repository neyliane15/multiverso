import { chaveBusca } from '@/util/formato'
import type { ProdutoCompleto } from '@/tipos/banco'

/**
 * Quantos produtos ativos estão em cada estoque de setor.
 *
 * Serve para a tela avisar o que um "arquivar" leva junto: arquivar a
 * Geladeira 1 com 40 produtos dentro tira 40 linhas da próxima folha de
 * contagem, e esse número tem de estar à vista antes do clique.
 *
 * Conta produto, não vínculo: o mesmo produto na Geladeira 1 e na 2 conta uma
 * vez em cada, porque é uma parada de contagem em cada.
 */
export function contarProdutosPorEstoque(
  produtos: readonly ProdutoCompleto[],
): ReadonlyMap<string, number> {
  const contagem = new Map<string, number>()
  for (const produto of produtos) {
    if (!produto.ativo) continue
    for (const setor of produto.setores) {
      for (const estoque of setor.estoques ?? []) {
        contagem.set(estoque.id, (contagem.get(estoque.id) ?? 0) + 1)
      }
    }
  }
  return contagem
}

/* ─────────────────────────────── escolher produtos para um lugar ────────── */

export interface ProdutoDoSetor {
  id: string
  nome: string
  categoriaNome: string | null
  categoriaCor: string | null
  /** Já está neste estoque. */
  dentro: boolean
  /** Outros lugares do MESMO setor onde ele também está. */
  tambemEm: string[]
}

/**
 * Os produtos que um estoque de setor pode receber.
 *
 * São os do SETOR, não os do restaurante: a Câmara fria da Cozinha não pode
 * receber uma cerveja que só existe no Bar — o banco recusaria, e oferecer na
 * tela o que o banco recusa é prometer o que não se cumpre.
 *
 * O `tambemEm` não é enfeite. Um produto pode estar em vários lugares do mesmo
 * setor, e cada um vira uma linha própria na folha. Quem está montando a
 * Geladeira 2 precisa ver que aquele item já está na Geladeira 1 — senão marca
 * sem perceber que acabou de criar uma segunda contagem do mesmo produto.
 */
export function produtosParaOEstoque(
  produtos: readonly ProdutoCompleto[],
  setorId: string,
  estoqueId: string,
): ProdutoDoSetor[] {
  const lista: ProdutoDoSetor[] = []

  for (const produto of produtos) {
    if (!produto.ativo) continue
    const vinculo = produto.setores.find((s) => s.setor_id === setorId)
    if (!vinculo) continue

    const lugares = vinculo.estoques ?? []
    lista.push({
      id: produto.id,
      nome: produto.nome,
      categoriaNome: produto.categoria_nome,
      categoriaCor: produto.categoria_cor,
      dentro: lugares.some((e) => e.id === estoqueId),
      tambemEm: lugares.filter((e) => e.id !== estoqueId).map((e) => e.nome),
    })
  }

  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Filtra pela busca, ignorando acento e caixa, como o resto do sistema. */
export function filtrarProdutosDoSetor(
  lista: readonly ProdutoDoSetor[],
  busca: string,
): ProdutoDoSetor[] {
  const alvo = chaveBusca(busca)
  if (alvo === '') return [...lista]
  return lista.filter((p) => chaveBusca(p.nome).includes(alvo))
}

/**
 * O que mudou entre o que estava marcado e o que está agora.
 *
 * A tela mostra esse número antes de salvar: "20 a mais, 3 a menos" diz o
 * tamanho do que vai acontecer melhor do que "23 selecionados", porque o que
 * assusta é o que muda, não o total.
 */
export function diferencaDeMarcacao(
  lista: readonly ProdutoDoSetor[],
  marcados: ReadonlySet<string>,
): { entram: number; saem: number } {
  let entram = 0
  let saem = 0
  for (const produto of lista) {
    const agora = marcados.has(produto.id)
    if (agora && !produto.dentro) entram += 1
    if (!agora && produto.dentro) saem += 1
  }
  return { entram, saem }
}
