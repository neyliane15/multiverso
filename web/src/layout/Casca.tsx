/**
 * A casca do app: barra lateral com os módulos, barra superior com o
 * restaurante ativo, e o miolo onde as páginas entram.
 *
 * O menu não é escrito aqui — ele sai de `rotas.ts`, filtrado pelo papel de
 * quem está logado. Módulo novo aparece sozinho.
 */
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import * as Icones from 'lucide-react'
import clsx from 'clsx'
import { menuVisivel } from '@/rotas'
import { useSessao } from '@/dados/sessao'
import { useMarca } from '@/tema/ProvedorDeMarca'
import { Logo } from '@/componentes/Logo'
import { LogoDoRestaurante } from '@/componentes/LogoDoRestaurante'
import { Botao, Selecao } from '@/componentes/base'
import { iniciais } from '@/util/formato'

function Icone({ nome, className }: { nome: string; className?: string }) {
  const C = (Icones as unknown as Record<string, Icones.LucideIcon>)[nome]
  return C ? <C className={className} aria-hidden /> : null
}

export function Casca() {
  const { perfil, restaurante, restaurantesVisiveis, ehMaster, trocarRestaurante, sair } =
    useSessao()
  const { tema, definirTema } = useMarca()
  const [aberto, setAberto] = useState(false)
  const local = useLocation()

  // Navegou no celular? A gaveta fecha. Deixá-la aberta esconde a página que
  // a pessoa acabou de pedir.
  useEffect(() => setAberto(false), [local.pathname])

  const modulos = menuVisivel(perfil?.papel ?? null, Boolean(restaurante))

  return (
    <div className="min-h-dvh bg-fundo text-texto">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-marca-p focus:bg-primaria focus:px-4 focus:py-2 focus:text-sobre-primaria"
      >
        Pular para o conteúdo
      </a>

      {/* ───────────────────────────────────────────────── barra lateral ── */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-borda bg-superficie',
          'transition-transform lg:translate-x-0',
          aberto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-borda px-5">
          <Logo className="h-7" />
        </div>

        {/* No celular a barra de cima esconde o seletor de restaurante, e sem ele
            o master via todas as telas dizerem "escolha um restaurante na barra
            de cima" apontando para um controle que não existe naquela largura.
            Aqui ele existe; no desktop, quem manda é o da barra de cima. */}
        {ehMaster && restaurantesVisiveis.length > 0 && (
          <div className="border-b border-borda px-3 py-3 sm:hidden">
            <label htmlFor="restaurante-em-foco" className="mv-rotulo mb-1.5 block px-1">
              Restaurante em foco
            </label>
            <Selecao
              id="restaurante-em-foco"
              value={restaurante?.id ?? ''}
              onChange={(e) => trocarRestaurante(e.target.value)}
            >
              {restaurantesVisiveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Módulos">
          {modulos.map((modulo) => (
            <div key={modulo.numero} className="mb-5 last:mb-0">
              <div className="mv-rotulo px-2 pb-1.5">{modulo.rotulo}</div>
              <ul className="space-y-0.5">
                {modulo.itens.map((item) => (
                  <li key={item.caminho}>
                    <NavLink
                      to={item.caminho}
                      end={item.caminho === '/'}
                      title={item.descricao}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex min-h-toque items-center gap-2.5 rounded-marca-p px-2.5 text-corpo',
                          'transition-colors',
                          isActive
                            ? 'bg-primaria-16 font-medium text-primaria-legivel'
                            : 'text-texto-suave hover:bg-primaria-06 hover:text-texto',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={clsx(
                              'absolute left-0 h-5 w-0.75 rounded-r-full bg-primaria transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <Icone nome={item.icone} className="size-[18px] shrink-0" />
                          <span className="truncate">{item.rotulo}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mv-segura-b border-t border-borda px-3 pt-3 [--mv-folga-b:0.75rem]">
          <div className="flex items-center gap-2.5 rounded-marca-p px-2 py-2">
            <div className="mv-numero grid size-8 shrink-0 place-items-center rounded-full bg-primaria-24 text-rotulo font-semibold text-primaria-legivel">
              {iniciais(perfil?.nome ?? '?')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-apoio font-medium">{perfil?.nome}</div>
              <div className="truncate text-micro capitalize text-texto-fraco">
                {perfil?.papel}
              </div>
            </div>
            <Botao tom="fantasma" tamanho="p" onClick={() => void sair()} aria-label="Sair do sistema">
              <Icones.LogOut className="size-4" aria-hidden />
            </Botao>
          </div>
        </div>
      </aside>

      {aberto && (
        <button
          className="mv-entra fixed inset-0 z-30 bg-neutro-1000/60 lg:hidden"
          onClick={() => setAberto(false)}
          aria-label="Fechar menu"
        />
      )}

      {/* ─────────────────────────────────────────────────────── conteúdo ── */}
      <div className="lg:pl-[248px]">
        <header className="mv-segura-x sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-borda bg-fundo/85 backdrop-blur-md [--mv-folga-x:1rem] sm:[--mv-folga-x:1.5rem]">
          <Botao
            tom="fantasma"
            tamanho="p"
            className="lg:hidden"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
          >
            <Icones.Menu className="size-5" aria-hidden />
          </Botao>

          {restaurante && (
            <div className="flex min-w-0 items-center gap-2.5">
              <LogoDoRestaurante
                nome={restaurante.nome}
                logoUrl={restaurante.logo_url}
                logoEscuroUrl={restaurante.logo_escuro_url}
                marca={restaurante}
                tamanho={32}
                decorativo
              />
              <div className="min-w-0">
                <div className="truncate text-corpo font-medium leading-tight">
                  {restaurante.nome}
                </div>
                {restaurante.unidade && (
                  <div className="truncate text-micro leading-tight text-texto-fraco">
                    {restaurante.unidade}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Só o master escolhe de qual restaurante está falando. */}
          {ehMaster && restaurantesVisiveis.length > 0 && (
            <Selecao
              value={restaurante?.id ?? ''}
              onChange={(e) => trocarRestaurante(e.target.value)}
              aria-label="Restaurante em foco"
              className="hidden w-56 sm:block"
            >
              {restaurantesVisiveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          )}

          <Botao
            tom="fantasma"
            tamanho="p"
            onClick={() => definirTema(tema === 'escuro' ? 'claro' : 'escuro')}
            aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
          >
            {tema === 'escuro' ? (
              <Icones.Sun className="size-[18px]" aria-hidden />
            ) : (
              <Icones.Moon className="size-[18px]" aria-hidden />
            )}
          </Botao>
        </header>

        <main
          id="conteudo"
          className="mv-segura-x mx-auto max-w-[1400px] space-y-6 py-6 [--mv-folga-x:1rem] sm:[--mv-folga-x:1.5rem]"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
