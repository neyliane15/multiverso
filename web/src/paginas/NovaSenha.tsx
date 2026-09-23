/**
 * A tela que o link de recuperação abre.
 *
 * O GoTrue devolve a pessoa ao app já com sessão, em modo de recuperação. Sem
 * esta tela, ela cairia direto no sistema com a senha antiga ainda valendo — o
 * link teria "funcionado" sem trocar nada, que é o pior dos dois mundos:
 * parece resolvido e não está.
 */
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/dados/supabase'
import { Aviso, Botao, Campo, Rotulo } from '@/componentes/base'
import { Logo } from '@/componentes/Logo'
import { useSessao } from '@/dados/sessao'
import { MINIMO_DA_SENHA, mensagemDeAuth, problemaDaSenha } from './logicaDeEntrada'

export function NovaSenha() {
  const { concluirRecuperacao, sair } = useSessao()
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    const problema = problemaDaSenha(senha, repetida)
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) {
      setErro(mensagemDeAuth(error.message))
      return
    }
    concluirRecuperacao()
  }

  return (
    <div className="mv-segura-x mv-segura-b grid min-h-dvh place-items-center bg-fundo pt-10 [--mv-folga-b:2.5rem] [--mv-folga-x:1rem]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="h-9" />
        </div>

        <form
          onSubmit={(e) => void salvar(e)}
          className="space-y-5 rounded-marca border border-borda bg-superficie-1 p-5 shadow-baixa"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primaria-16 text-primaria-legivel">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <div>
              <h1 className="font-titulo text-secao leading-tight font-semibold">Escolha a senha nova</h1>
              <p className="mt-1 text-apoio leading-relaxed text-texto-fraco">
                A antiga para de valer assim que você salvar.
              </p>
            </div>
          </div>

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <div className="space-y-1.5">
            <Rotulo para="nova">Senha nova</Rotulo>
            <Campo
              id="nova"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              minLength={MINIMO_DA_SENHA}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Rotulo para="nova-repetida">Repita a senha</Rotulo>
            <Campo
              id="nova-repetida"
              type="password"
              autoComplete="new-password"
              required
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>

          <Botao type="submit" tom="primario" tamanho="g" carregando={enviando} className="w-full">
            Salvar e entrar
          </Botao>

          <Botao tom="fantasma" tamanho="p" className="w-full" onClick={() => void sair()}>
            Cancelar e sair
          </Botao>
        </form>
      </div>
    </div>
  )
}
