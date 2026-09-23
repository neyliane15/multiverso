/**
 * A consulta do perfil falhou — e isso não é a mesma coisa que não ter perfil.
 *
 * Os dois casos terminavam em `perfil = null`, e `null` levava à tela que diz
 * "sua conta existe mas ainda não tem acesso". Quem tropeçava numa oscilação
 * de rede saía atrás de um convite que já tinha, enquanto o problema real
 * passaria sozinho numa segunda tentativa.
 *
 * Daí esta tela existir separada, com o botão que a outra não deveria ter:
 * tentar de novo, sem sair da conta.
 */
import { CloudOff } from 'lucide-react'
import { Botao } from '@/componentes/base'
import { Logo } from '@/componentes/Logo'
import { useSessao } from '@/dados/sessao'

export function FalhaAoCarregar() {
  const { falhaAoCarregar, recarregarPerfil, sair } = useSessao()

  return (
    <div className="mv-segura-x mv-segura-b grid min-h-dvh place-items-center bg-fundo pt-10 [--mv-folga-b:2.5rem] [--mv-folga-x:1rem]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo className="h-9" />
        </div>

        <div className="rounded-marca border border-borda bg-superficie-1 p-6 text-center shadow-baixa">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-info-suave text-info-texto">
            <CloudOff className="size-6" aria-hidden />
          </div>

          <h1 className="mt-4 font-titulo text-secao leading-tight font-semibold">
            Não consegui carregar seu perfil
          </h1>

          <p className="mt-3 text-corpo leading-relaxed text-texto-suave">
            Sua conta está certa e você continua conectada — foi a consulta ao servidor que não
            voltou. Costuma ser oscilação de rede, e passa numa segunda tentativa.
          </p>

          {falhaAoCarregar && (
            <p className="mt-3 rounded-marca-p border border-borda bg-superficie-2 px-3 py-2 text-apoio text-texto-fraco">
              {falhaAoCarregar}
            </p>
          )}

          <Botao
            tom="primario"
            tamanho="g"
            className="mt-5 w-full"
            onClick={() => recarregarPerfil()}
          >
            Tentar de novo
          </Botao>

          <Botao tom="fantasma" tamanho="p" className="mt-2 w-full" onClick={() => void sair()}>
            Sair
          </Botao>
        </div>
      </div>
    </div>
  )
}
