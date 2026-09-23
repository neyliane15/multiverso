/**
 * Entrou, mas não tem perfil.
 *
 * Acontece por dois caminhos, ambos legítimos: alguém se cadastrou sem convite
 * nenhum, ou o convite expirou (14 dias) antes de a pessoa criar a conta. O
 * banco trata isso como estado seguro — conta existe no auth, não tem perfil,
 * não enxerga linha nenhuma (migração 0008).
 *
 * A tela, porém, tratava como "ainda carregando" e ficava rodando para sempre.
 * Um spinner eterno é a pior resposta possível: não diz o que houve, não dá
 * saída, e quem está do outro lado conclui que o sistema quebrou.
 */
import { MailQuestion } from 'lucide-react'
import { Botao } from '@/componentes/base'
import { Logo } from '@/componentes/Logo'
import { useSessao } from '@/dados/sessao'

export function SemConvite() {
  const { sessao, sair } = useSessao()
  const email = sessao?.user.email ?? ''

  return (
    <div className="mv-segura-x mv-segura-b grid min-h-dvh place-items-center bg-fundo pt-10 [--mv-folga-b:2.5rem] [--mv-folga-x:1rem]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo className="h-9" />
        </div>

        <div className="rounded-marca border border-borda bg-superficie-1 p-6 text-center shadow-baixa">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-alerta-suave text-alerta-texto">
            <MailQuestion className="size-6" aria-hidden />
          </div>

          <h1 className="mt-4 font-titulo text-secao leading-tight font-semibold">
            Sua conta existe, mas ainda não tem acesso
          </h1>

          <p className="mt-3 text-corpo leading-relaxed text-texto-suave">
            Entramos com <strong className="text-texto">{email}</strong>, mas não há convite
            pendente para esse endereço. O convite é o que diz em qual restaurante você trabalha e
            com que papel — sem ele, não há o que mostrar.
          </p>

          <div className="mt-5 rounded-marca-p border border-borda bg-superficie-2 p-4 text-left">
            <p className="text-apoio leading-relaxed text-texto-suave">
              Duas causas comuns:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-apoio leading-relaxed text-texto-fraco">
              <li>
                o convite foi feito para <em>outro</em> e-mail — confira com quem te convidou e
                entre com aquele endereço;
              </li>
              <li>o convite venceu (eles valem 14 dias). Peça um novo.</li>
            </ul>
          </div>

          <Botao tom="secundario" tamanho="g" className="mt-5 w-full" onClick={() => void sair()}>
            Sair e tentar com outro e-mail
          </Botao>
        </div>
      </div>
    </div>
  )
}
