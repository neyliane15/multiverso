/**
 * Porta de entrada. Ainda sem sessão, então a tela usa a marca da plataforma —
 * a do restaurante só chega depois que sabemos quem entrou.
 */
import { useState } from 'react'
import { supabase } from '@/dados/supabase'
import { Logo } from '@/componentes/Logo'
import { Aviso, Botao, Campo, Rotulo } from '@/componentes/base'

export function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) {
      // A mensagem do Supabase vem em inglês e genérica de propósito (não conta
      // se o e-mail existe). Traduzimos mantendo essa discrição.
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha não conferem.'
          : error.message,
      )
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-fundo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="h-9" />
        </div>

        <form
          onSubmit={entrar}
          className="space-y-4 rounded-marca border border-borda bg-superficie-1 p-6"
        >
          <div>
            <h1 className="font-titulo text-[17px] font-semibold">Entrar</h1>
            <p className="mt-1 text-[13px] text-texto-fraco">
              Use o e-mail cadastrado pelo administrador do seu restaurante.
            </p>
          </div>

          {erro && <Aviso tom="erro">{erro}</Aviso>}

          <div className="space-y-1.5">
            <Rotulo para="email">E-mail</Rotulo>
            <Campo
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@restaurante.com.br"
            />
          </div>

          <div className="space-y-1.5">
            <Rotulo para="senha">Senha</Rotulo>
            <Campo
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          <Botao type="submit" tom="primario" tamanho="g" carregando={enviando} className="w-full">
            Entrar
          </Botao>
        </form>

        <p className="mt-6 text-center text-[12px] text-texto-fraco">
          Multiverso · gestão de restaurantes
        </p>
      </div>
    </div>
  )
}
