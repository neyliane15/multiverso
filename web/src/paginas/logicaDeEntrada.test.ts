import { describe, expect, it } from 'vitest'
import {
  MINIMO_DA_SENHA,
  depoisDoCadastro,
  mensagemDeAuth,
  precisaConfirmar,
  problemaDaSenha,
} from './logicaDeEntrada'

describe('mensagemDeAuth · traduzir sem contar mais do que o servidor conta', () => {
  it('login errado nao revela se o e-mail existe', () => {
    // A mensagem do GoTrue e generica de proposito. Traduzir para "este e-mail
    // nao esta cadastrado" entregaria a lista de usuarios para quem sondasse.
    const traduzida = mensagemDeAuth('Invalid login credentials')
    expect(traduzida).toBe('E-mail ou senha não conferem.')
    expect(traduzida.toLowerCase()).not.toContain('não existe')
  })

  it('e-mail nao confirmado manda olhar o spam', () => {
    expect(mensagemDeAuth('Email not confirmed')).toContain('spam')
  })

  it('e-mail ja cadastrado oferece a saida certa', () => {
    expect(mensagemDeAuth('User already registered')).toContain('Esqueci minha senha')
  })

  it('cadastro desligado no projeto diz onde se liga', () => {
    expect(mensagemDeAuth('Signups not allowed for this instance')).toContain('Supabase')
  })

  it('senha curta diz o minimo', () => {
    expect(mensagemDeAuth('Password should be at least 6 characters')).toContain('6')
  })

  it('mensagem desconhecida passa inteira, em vez de virar "erro inesperado"', () => {
    expect(mensagemDeAuth('Algo bem especifico do servidor')).toBe('Algo bem especifico do servidor')
  })
})

describe('depoisDoCadastro · dois sucessos bem diferentes', () => {
  it('com sessao, a pessoa entrou', () => {
    expect(depoisDoCadastro(true)).toMatchObject({ entrou: true })
  })

  it('sem sessao, falta confirmar o e-mail — e a tela precisa dizer isso', () => {
    // `signUp` responde "ok" tambem quando o projeto exige confirmacao. Tratar
    // os dois igual deixa a pessoa parada esperando algo que nao vem.
    const r = depoisDoCadastro(false)
    expect(r.entrou).toBe(false)
    expect(r.texto).toContain('link')
  })
})

describe('problemaDaSenha', () => {
  it('cobra o minimo do GoTrue antes de ir ao servidor', () => {
    expect(problemaDaSenha('123', '123')).toContain(String(MINIMO_DA_SENHA))
  })

  it('cobra as duas iguais', () => {
    expect(problemaDaSenha('senha123', 'senha124')).toBe('As duas senhas não são iguais.')
  })

  it('senha boa e repetida certa passa', () => {
    expect(problemaDaSenha('senha123', 'senha123')).toBeNull()
  })

  it('a checagem de tamanho vem antes da de igualdade', () => {
    // Duas curtas e iguais: o erro util e o tamanho, nao "sao iguais".
    expect(problemaDaSenha('12', '12')).toContain(String(MINIMO_DA_SENHA))
  })
})

describe('precisaConfirmar · o unico erro com saida propria', () => {
  it('reconhece o e-mail nao confirmado', () => {
    expect(precisaConfirmar('Email not confirmed')).toBe(true)
    expect(precisaConfirmar('email not confirmed')).toBe(true)
  })

  it('nao confunde com senha errada', () => {
    // Oferecer "reenviar confirmacao" a quem so errou a senha manda a pessoa
    // caçar um e-mail que nao tem nada a ver com o problema dela.
    expect(precisaConfirmar('Invalid login credentials')).toBe(false)
    expect(precisaConfirmar('User already registered')).toBe(false)
  })
})

describe('depoisDoCadastro · o texto nao pode esconder que isso e configuravel', () => {
  it('diz que a exigencia vem do projeto, e que da para desligar', () => {
    // O convite ja identifica a pessoa; a confirmacao e uma segunda prova que
    // quem administra escolhe exigir ou nao.
    const texto = depoisDoCadastro(false).texto
    expect(texto).toContain('Supabase')
    expect(texto).toContain('desligar')
  })

  it('e promete que o link volta para ca, nao para outro lugar', () => {
    // Era o defeito: sem `emailRedirectTo`, o link caía no Site URL do
    // projeto — http://localhost:3000 de fabrica.
    expect(depoisDoCadastro(false).texto).toContain('volta para cá')
  })
})
