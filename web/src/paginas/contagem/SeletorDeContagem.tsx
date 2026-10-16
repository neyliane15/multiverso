/**
 * Qual contagem a tela está lendo.
 *
 * Mora aqui, ao lado das telas, e não em `componentes/base.tsx`: é a peça do
 * módulo 2, não do sistema. Mas é de DUAS telas — o dashboard e o relatório —
 * e duas cópias de um seletor são duas chances de uma delas abrir numa
 * contagem diferente da outra, o que faria os números das duas páginas
 * parecerem discordar.
 *
 * A regra de qual contagem vem marcada está em `logicaDoDashboard`
 * (`contagemPadrao`), com teste próprio.
 */
import type { ContagemResumo } from '@/tipos/banco'
import { Selecao } from '@/componentes/base'
import { data as formatarData, dinheiro } from '@/util/formato'
import { opcoesDeContagem } from './logicaDoDashboard'

export function SeletorDeContagem({
  contagens,
  escolhida,
  aoEscolher,
  rotulo = 'Contagem em leitura',
}: {
  contagens: readonly ContagemResumo[]
  escolhida: string | null
  aoEscolher: (id: string) => void
  rotulo?: string
}) {
  const opcoes = opcoesDeContagem(contagens)
  return (
    <Selecao
      aria-label={rotulo}
      value={escolhida ?? ''}
      onChange={(e) => aoEscolher(e.target.value)}
      className="w-full sm:w-72"
    >
      {opcoes.map((c) => (
        <option key={c.id} value={c.id}>
          {formatarData(c.referencia)}
          {' · '}
          {dinheiro(c.total)}
          {/* O estado da contagem vai no próprio rótulo da opção: quem abre a
              lista precisa ver que a de cima é a folha em andamento ANTES de
              escolhê-la, não depois, pelo aviso da página. */}
          {c.status === 'fechada' ? '' : ' · em andamento'}
        </option>
      ))}
    </Selecao>
  )
}
