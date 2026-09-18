/**
 * A marca de um restaurante que **não** é o que está em foco.
 *
 * `vw_panorama_restaurantes` traz só a cor primária de cada um, e o monograma
 * precisa de duas para desenhar a diagonal. A segunda é derivada da primeira —
 * mais escura, com a matiz girada — em vez de cair numa cor fixa, que deixaria
 * todos os cartões da rede com o mesmo degradê.
 *
 * Esta é a exceção prevista na IDENTIDADE: nas telas que mostram vários
 * restaurantes ao mesmo tempo, a cor vem do banco, por props, para o `style`.
 */
import { MARCA_PADRAO, deOklch, oklch } from '@/tema/marca'
import type { Marca } from '@/tipos/banco'

export function marcaDoPanorama(corPrimaria: string, logoUrl: string | null): Marca {
  const { L, C, H } = oklch(corPrimaria)
  const segunda = deOklch(Math.max(0.18, L * 0.62), C * 0.9, (H + 28) % 360)
  return {
    ...MARCA_PADRAO,
    cor_primaria: corPrimaria,
    cor_secundaria: segunda.hex,
    logo_url: logoUrl,
    logo_escuro_url: null,
  }
}
