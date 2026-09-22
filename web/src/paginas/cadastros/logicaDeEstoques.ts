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
