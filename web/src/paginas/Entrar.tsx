/**
 * Porta de entrada. Ainda sem sessão, então a tela usa a marca da plataforma —
 * a do restaurante só chega depois que sabemos quem entrou.
 *
 * Três modos na mesma tela, porque são a mesma porta: entrar, criar a conta do
 * convite, e recuperar a senha.
 *
 * O cadastro fica aqui, aberto, e isso NÃO afrouxa nada: quem se cadastra sem
 * convite pendente não ganha perfil (migração 0008) e não enxerga uma linha
 * sequer. O convite, gravado antes por quem tem poder de dá-lo, é que decide
 * papel e restaurante — o `signUp` do navegador não decide nada. Antes desta
 * tela existir, o sistema convidava mas não deixava ninguém criar senha: o
 * administrador tinha de abrir o painel do Supabase e criar o usuário à mão.
 */
import { useState } from 'react'
import { supabase } from '@/dados/supabase'
import { Logo } from '@/componentes/Logo'
import { Aviso, Botao, Campo, Rotulo } from '@/componentes/base'
import {
  MINIMO_DA_SENHA,
  depoisDoCadastro,
  mensagemDeAuth,
  precisaConfirmar,
  problemaDaSenha,
  type ModoDaEntrada,
} from './logicaDeEntrada'

const TITULOS: Record<ModoDaEntrada, { titulo: string; ajuda: string }> = {
  entrar: {
    titulo: 'Entrar',
    ajuda: 'Use o e-mail que o administrador do seu restaurante convidou.',
  },
  criar: {
    titulo: 'Criar minha conta',
    ajuda:
      'Use exatamente o e-mail do convite. É ele que diz seu papel e seu restaurante — a senha é sua e ninguém mais a vê.',
  },
  recuperar: {
    titulo: 'Esqueci minha senha',
    ajuda: 'Enviamos um link para você escolher uma senha nova.',
  },
}

export function Entrar() {
  const [modo, setModo] = useState<ModoDaEntrada>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<{ titulo: string; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [podeReenviar, setPodeReenviar] = useState(false)

  async function reenviarConfirmacao() {
    setEnviando(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setEnviando(false)
    if (error) {
      setErro(mensagemDeAuth(error.message))
      return
    }
    setPodeReenviar(false)
    setRecado({
      titulo: 'Link reenviado',
      texto: 'Abra a mensagem mais recente — as anteriores não valem mais.',
    })
  }

  function trocarModo(proximo: ModoDaEntrada) {
    setModo(proximo)
    setErro(null)
    setRecado(null)
    setPodeReenviar(false)
    setSenha('')
    setRepetida('')
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setRecado(null)
    setPodeReenviar(false)

    if (modo === 'criar') {
      const problema = problemaDaSenha(senha, repetida)
      if (problema) {
        setErro(problema)
        return
      }
    }

    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) {
          setErro(mensagemDeAuth(error.message))
          // O convite já foi consumido no cadastro, então quem não confirmou
          // não consegue entrar E não pode ser convidado de novo. Sem uma
          // saída aqui, a pessoa fica presa e só um master a destrava.
          setPodeReenviar(precisaConfirmar(error.message))
        }
        return
      }

      if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          // Sem isto o link de confirmação volta para o "Site URL" do projeto,
          // que sai de fábrica como http://localhost:3000 — a pessoa confirma
          // e cai numa tela que não existe. Aqui ele volta para o endereço de
          // onde ela se cadastrou, seja a Vercel ou a máquina de quem testa.
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) {
          setErro(mensagemDeAuth(error.message))
          return
        }
        const { entrou, titulo, texto } = depoisDoCadastro(data.session !== null)
        setRecado({ titulo, texto })
        if (!entrou) setModo('entrar')
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      // Erro aqui não vira mensagem diferente de propósito: responder "este
      // e-mail não existe" entregaria a lista de usuários para quem sondasse.
      if (error && !error.message.toLowerCase().includes('user not found')) {
        setErro(mensagemDeAuth(error.message))
        return
      }
      setRecado({
        titulo: 'Link a caminho',
        texto:
          'Se existir uma conta com esse e-mail, o link para trocar a senha chega em instantes. Olhe também o spam.',
      })
      setModo('entrar')
    } finally {
      setEnviando(false)
    }
  }

  const { titulo, ajuda } = TITULOS[modo]

  return (
    <div className="mv-segura-x mv-segura-b grid min-h-dvh place-items-center bg-fundo pt-10 [--mv-folga-b:2.5rem] [--mv-folga-x:1rem]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="h-9" />
        </div>

        <form
          onSubmit={(e) => void enviar(e)}
          className="space-y-5 rounded-marca border border-borda bg-superficie-1 p-5 shadow-baixa"
        >
          <div>
            <h1 className="font-titulo text-secao leading-tight font-semibold">{titulo}</h1>
            <p className="mt-1 text-apoio leading-relaxed text-texto-fraco">{ajuda}</p>
          </div>

          {erro && (
            <Aviso tom="erro">
              {erro}
              {podeReenviar && (
                <Botao
                  tom="secundario"
                  tamanho="p"
                  className="mt-2"
                  carregando={enviando}
                  onClick={() => void reenviarConfirmacao()}
                >
                  Reenviar o link de confirmação
                </Botao>
              )}
            </Aviso>
          )}
          {recado && (
            <Aviso tom="sucesso" titulo={recado.titulo}>
              {recado.texto}
            </Aviso>
          )}

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

          {modo !== 'recuperar' && (
            <div className="space-y-1.5">
              <Rotulo para="senha">Senha</Rotulo>
              <Campo
                id="senha"
                type="password"
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                required
                minLength={modo === 'criar' ? MINIMO_DA_SENHA : undefined}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
          )}

          {modo === 'criar' && (
            <div className="space-y-1.5">
              <Rotulo para="repetida">Repita a senha</Rotulo>
              <Campo
                id="repetida"
                type="password"
                autoComplete="new-password"
                required
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
              />
            </div>
          )}

          <Botao type="submit" tom="primario" tamanho="g" carregando={enviando} className="w-full">
            {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
          </Botao>

          <div className="flex flex-wrap justify-between gap-2 border-t border-borda pt-4">
            {modo === 'entrar' ? (
              <>
                <Botao tom="fantasma" tamanho="p" onClick={() => trocarModo('criar')}>
                  Tenho um convite
                </Botao>
                <Botao tom="fantasma" tamanho="p" onClick={() => trocarModo('recuperar')}>
                  Esqueci minha senha
                </Botao>
              </>
            ) : (
              <Botao tom="fantasma" tamanho="p" onClick={() => trocarModo('entrar')}>
                Voltar para entrar
              </Botao>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-apoio text-texto-fraco">
          Cadastros, contagem, compras e CMV
        </p>
      </div>
    </div>
  )
}
