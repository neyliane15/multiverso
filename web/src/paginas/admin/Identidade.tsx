/**
 * Administração · Identidade visual — a marca de cada restaurante.
 *
 * É a tela que o enunciado pede por extenso: "deixe em configurações do admin
 * a forma de adicionar a logomarca e cores conforme cada usuário for se
 * cadastrando como restaurante".
 *
 * Aqui não se reimplementa nada: `CampoDeMarca.tsx` já tem o seletor de cor
 * com o contraste medido, o envio de arquivo para o bucket `marcas`, a lista
 * curada de fontes e a prévia. Esta tela é a **montagem** dessas peças, mais
 * três coisas que são decisão de produto:
 *
 *  · o aviso de `validarMarca` fica visível e **não bloqueia** — a marca é do
 *    cliente, e a decisão é dele;
 *  · salvar aplica na hora, porque trocar de marca é reescrever variáveis CSS,
 *    não remontar a árvore (quem cuida disso é o `ProvedorDeMarca`);
 *  · dá para voltar à marca padrão do sistema a qualquer momento.
 */
import { useMemo, useState } from 'react'
import { Check, Eye, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Cartao,
  EstadoVazio,
  Rotulo,
  Selecao,
} from '@/componentes/base'
import { EnvioDeLogo, PreviaDaMarca, SeletorDeCor, SeletorDeFonte } from '@/componentes/CampoDeMarca'
import { useSalvarRestaurante } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { marcaDoRestaurante } from '@/tema/ProvedorDeMarca'
import { MARCA_PADRAO, validarMarca } from '@/tema/marca'
import type { Marca } from '@/tipos/banco'

/** O raio é escolha do restaurante, mas a escala é do sistema. */
const RAIOS: readonly { valor: string; rotulo: string }[] = [
  { valor: '4px', rotulo: 'Reto — 4px' },
  { valor: '8px', rotulo: 'Discreto — 8px' },
  { valor: '14px', rotulo: 'Padrão do sistema — 14px' },
  { valor: '20px', rotulo: 'Arredondado — 20px' },
  { valor: '28px', rotulo: 'Muito arredondado — 28px' },
]

const CORES: readonly { campo: keyof Marca; rotulo: string; ajuda: string }[] = [
  {
    campo: 'cor_primaria',
    rotulo: 'Primária',
    ajuda: 'A ação: o botão que fecha a contagem, a linha selecionada, a primeira série do gráfico.',
  },
  {
    campo: 'cor_acento',
    rotulo: 'Acento',
    ajuda: 'O segundo sinal: o anel de foco e o destaque de atenção que não é erro.',
  },
  {
    campo: 'cor_secundaria',
    rotulo: 'Secundária',
    ajuda: 'Estrutural: fundo de cabeçalho e a diagonal do monograma quando não há logo.',
  },
  {
    campo: 'cor_fundo',
    rotulo: 'Fundo',
    ajuda: 'O fundo da página inteira, atrás dos cartões.',
  },
  {
    campo: 'cor_superficie',
    rotulo: 'Superfície',
    ajuda: 'O cartão, a tabela, a barra lateral. Os degraus elevados saem dela.',
  },
  {
    campo: 'cor_texto',
    rotulo: 'Texto',
    ajuda: 'A cor de leitura. É ela que precisa passar em AA contra o fundo e a superfície.',
  },
]

export function Identidade(): JSX.Element {
  const { restaurante, perfil, ehMaster, recarregar } = useSessao()
  const salvar = useSalvarRestaurante()

  const original = useMemo(() => marcaDoRestaurante(restaurante), [restaurante])
  const [rascunho, setRascunho] = useState<Marca>(original)
  const [salvo, setSalvo] = useState(false)

  // O master troca de restaurante sem sair da tela. Recalcular o rascunho
  // durante a renderização — e não num efeito — evita o quadro em que a prévia
  // mostra a marca do restaurante anterior.
  const [idEmEdicao, setIdEmEdicao] = useState(restaurante?.id ?? '')
  if (restaurante && restaurante.id !== idEmEdicao) {
    setIdEmEdicao(restaurante.id)
    setRascunho(original)
    setSalvo(false)
  }

  const validacao = useMemo(() => validarMarca(rascunho), [rascunho])

  // A RLS de `restaurantes` deixa editar só o master e o admin do próprio
  // restaurante. A rota aceita gerente, então a tela precisa dizer isso — ou
  // ele preencheria tudo para tomar 42501 no fim.
  const podeEditar = ehMaster || perfil?.papel === 'admin'

  const mudou = useMemo(
    () => (Object.keys(rascunho) as (keyof Marca)[]).some((k) => rascunho[k] !== original[k]),
    [rascunho, original],
  )

  function mudar<K extends keyof Marca>(campo: K, valor: Marca[K]) {
    setSalvo(false)
    setRascunho((m) => ({ ...m, [campo]: valor }))
  }

  async function gravar() {
    if (!restaurante) return
    await salvar.mutateAsync({ id: restaurante.id, ...rascunho })
    await recarregar()
    setSalvo(true)
  }

  function restaurarPadrao() {
    setSalvo(false)
    // Os arquivos enviados ficam: eles são do cliente, e o botão fala de cores
    // e tipografia. Quem quiser tirar o logo usa o "Remover" do próprio campo.
    setRascunho((m) => ({
      ...MARCA_PADRAO,
      logo_url: m.logo_url,
      logo_escuro_url: m.logo_escuro_url,
      favicon_url: m.favicon_url,
    }))
  }

  if (!restaurante) {
    return (
      <EstadoVazio titulo="Nenhum restaurante em foco">
        Escolha um restaurante na barra de cima para editar a identidade visual dele.
      </EstadoVazio>
    )
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Identidade visual"
        descricao={`A cara de ${restaurante.nome} dentro do sistema: logomarca, cores, tipografia e raio de borda. O que você escolher aqui repinta o app inteiro.`}
        acoes={
          podeEditar && (
            <>
              <Botao
                tom="secundario"
                icone={<RotateCcw className="size-4" aria-hidden />}
                onClick={restaurarPadrao}
              >
                Voltar ao padrão do sistema
              </Botao>
              <Botao
                tom="primario"
                carregando={salvar.isPending}
                disabled={!mudou}
                onClick={() => void gravar()}
                icone={<Save className="size-4" aria-hidden />}
              >
                Salvar identidade
              </Botao>
            </>
          )
        }
      />

      {!podeEditar && (
        <Aviso tom="info" titulo="Você está só olhando">
          A identidade visual é editada pelo admin do restaurante ou por um master. Seu papel
          enxerga a configuração, mas o banco recusaria a gravação.
        </Aviso>
      )}

      {salvar.isError && (
        <Aviso tom="erro" titulo="Não deu para salvar">
          {salvar.error instanceof Error ? salvar.error.message : String(salvar.error)}
        </Aviso>
      )}

      {salvo && !mudou && (
        <Aviso tom="sucesso" titulo="Identidade salva">
          As novas variáveis já estão valendo — a tela se repintou sem recarregar.
        </Aviso>
      )}

      {mudou && (
        <Aviso tom="info" titulo="Alterações ainda não salvas">
          A prévia ao lado já mostra o resultado. O app só muda de verdade quando você salvar.
        </Aviso>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ─────────────────────────────────────────────── controles ───── */}
        <fieldset disabled={!podeEditar} className="min-w-0 space-y-6">
          <section className="space-y-3">
            <h2 className="font-titulo text-secao font-semibold text-texto">Logomarca</h2>
            <p className="text-apoio leading-relaxed text-texto-fraco">
              Sem arquivo, o sistema desenha um monograma com as iniciais e as cores deste
              restaurante — nunca fica um buraco no lugar da marca.
            </p>
            <div className="grid gap-4">
              <EnvioDeLogo
                restauranteId={restaurante.id}
                rotulo="Logo principal"
                ajuda="Aparece na barra de cima e nos cartões da rede."
                valor={rascunho.logo_url}
                aoMudar={(url) => mudar('logo_url', url)}
                prefixo="logo"
                fundoDaPrevia="superficie"
              />
              <EnvioDeLogo
                restauranteId={restaurante.id}
                rotulo="Logo para fundo escuro"
                ajuda="Opcional. Usado quando o tema deste restaurante é escuro."
                valor={rascunho.logo_escuro_url}
                aoMudar={(url) => mudar('logo_escuro_url', url)}
                prefixo="logo-escuro"
                fundoDaPrevia="escuro"
              />
              <EnvioDeLogo
                restauranteId={restaurante.id}
                rotulo="Favicon"
                ajuda="O ícone da aba do navegador. Quadrado, e legível em 16 pixels."
                valor={rascunho.favicon_url}
                aoMudar={(url) => mudar('favicon_url', url)}
                prefixo="favicon"
                fundoDaPrevia="claro"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-titulo text-secao font-semibold text-texto">Cores</h2>
            <p className="text-apoio leading-relaxed text-texto-fraco">
              Sucesso, alerta, erro e informação não estão aqui de propósito: eles são fixos do
              sistema. Um alerta vermelho não vira rosa porque o cliente escolheu rosa.
            </p>
            <div className="grid gap-4">
              {CORES.map((c) => (
                <SeletorDeCor
                  key={c.campo}
                  rotulo={c.rotulo}
                  ajuda={c.ajuda}
                  valor={String(rascunho[c.campo])}
                  aoMudar={(hex) => mudar(c.campo, hex as Marca[typeof c.campo])}
                  marca={rascunho}
                  campoDaMarca={c.campo}
                  desabilitado={!podeEditar}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-titulo text-secao font-semibold text-texto">Tipografia</h2>
            <p className="text-apoio leading-relaxed text-texto-fraco">
              Duas faces são do restaurante. A terceira, a dos números, é fixa: todo valor que entra
              em coluna usa a mesma face tabular, senão a coluna não alinha e ninguém confere.
            </p>
            <SeletorDeFonte
              rotulo="Fonte de título"
              papel="titulo"
              valor={rascunho.fonte_titulo}
              aoMudar={(f) => mudar('fonte_titulo', f)}
            />
            <SeletorDeFonte
              rotulo="Fonte de texto"
              papel="texto"
              valor={rascunho.fonte_texto}
              aoMudar={(f) => mudar('fonte_texto', f)}
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-titulo text-secao font-semibold text-texto">Forma e tema</h2>
            <div className="grid gap-4 rounded-marca border border-borda bg-superficie-1 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <Rotulo para="marca-raio">Raio de borda</Rotulo>
                <Selecao
                  id="marca-raio"
                  className="mt-1.5"
                  value={rascunho.raio_borda}
                  onChange={(e) => mudar('raio_borda', e.target.value)}
                >
                  {RAIOS.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.rotulo}
                    </option>
                  ))}
                </Selecao>
                <p className="mt-1.5 text-micro text-texto-fraco">
                  Vale para botão, campo, cartão e selo de uma vez só.
                </p>
              </div>

              <div>
                <Rotulo para="marca-tema">Tema</Rotulo>
                <Selecao
                  id="marca-tema"
                  className="mt-1.5"
                  value={rascunho.tema}
                  onChange={(e) => mudar('tema', e.target.value as Marca['tema'])}
                >
                  <option value="escuro">Escuro</option>
                  <option value="claro">Claro</option>
                </Selecao>
                <p className="mt-1.5 text-micro text-texto-fraco">
                  Define o conjunto de estados (sucesso, alerta, erro). Ele precisa combinar com a
                  cor de fundo escolhida acima.
                </p>
              </div>
            </div>
          </section>
        </fieldset>

        {/* ──────────────────────────────────────────────── prévia ─────── */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-20">
            <h2 className="mb-3 flex items-center gap-2 font-titulo text-secao font-semibold text-texto">
              <Eye className="size-5" aria-hidden />
              Como vai ficar
            </h2>
            <PreviaDaMarca marca={rascunho} nome={restaurante.nome} />

            <Cartao className="mt-4">
              <div className="p-5">
                {validacao.ok ? (
                  <p className="flex items-start gap-2 text-apoio text-sucesso-texto">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      Nenhum problema de contraste. Texto, botão e marca de gráfico passam nos
                      mínimos de AA com esta combinação.
                    </span>
                  </p>
                ) : (
                  <>
                    <h3 className="flex items-center gap-2 font-titulo text-corpo font-semibold text-alerta-texto">
                      <TriangleAlert className="size-4" aria-hidden />
                      {validacao.avisos.length === 1
                        ? 'Um ponto para você decidir'
                        : `${validacao.avisos.length} pontos para você decidir`}
                    </h3>
                    <ul className="mt-2 space-y-2 text-apoio leading-relaxed text-texto-suave">
                      {validacao.avisos.map((a) => (
                        <li key={a} className="flex gap-2">
                          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-alerta" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-apoio text-texto-fraco">
                      Nada disso impede salvar. A marca é do cliente e a decisão é dele — o sistema
                      só se recusa a fingir que não viu.
                    </p>
                  </>
                )}
              </div>
            </Cartao>
          </div>
        </div>
      </div>
    </>
  )
}
