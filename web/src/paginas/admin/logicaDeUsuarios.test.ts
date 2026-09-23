/**
 * A regra de papel é segurança. O banco a impõe pelo trigger `mv_guarda_papel`
 * e estes testes provam que a tela diz a mesma coisa *antes* do clique — e que
 * ela não afrouxa nada que o banco aperta.
 */
import { describe, expect, it } from 'vitest'
import type { PapelUsuario, Perfil } from '@/tipos/banco'
import {
  linkDoWhatsapp,
  mensagemDoConvite,
  normalizarTelefone,
  telefoneLegivel,
  avisoDeAutoAlteracao,
  filtrarEquipe,
  montarAlteracaoDePapel,
  opcoesDePapel,
  podeAlternarAtivo,
  podeDefinirPapel,
  podeEditarEquipe,
  type Envolvido,
} from './logicaDeUsuarios'

const CASA = 'r-casa'
const OUTRO = 'r-outro'

function pessoa(id: string, papel: PapelUsuario, restaurante: string | null = CASA): Envolvido {
  return { id, papel, restaurante_id: papel === 'master' ? null : restaurante }
}

const master = pessoa('u-master', 'master')
const admin = pessoa('u-admin', 'admin')
const gerente = pessoa('u-gerente', 'gerente')
const operador = pessoa('u-operador', 'operador')
const operadorDeFora = pessoa('u-fora', 'operador', OUTRO)

describe('podeEditarEquipe', () => {
  it('libera master e admin', () => {
    expect(podeEditarEquipe(master)).toBe(true)
    expect(podeEditarEquipe(admin)).toBe(true)
  })

  it('barra gerente e operador, mesmo com a rota aberta para gerente', () => {
    expect(podeEditarEquipe(gerente)).toBe(false)
    expect(podeEditarEquipe(operador)).toBe(false)
    expect(podeEditarEquipe(null)).toBe(false)
  })
})

describe('podeDefinirPapel', () => {
  it('admin não promove ninguém a master', () => {
    const r = podeDefinirPapel(admin, operador, 'master')
    expect(r.permitido).toBe(false)
    expect(r.motivo).toMatch(/master/i)
  })

  it('admin não altera o próprio papel', () => {
    const r = podeDefinirPapel(admin, admin, 'gerente')
    expect(r.permitido).toBe(false)
    expect(r.motivo).toMatch(/próprio papel/i)
  })

  it('admin não alcança usuário de outro restaurante', () => {
    expect(podeDefinirPapel(admin, operadorDeFora, 'gerente').permitido).toBe(false)
  })

  it('admin promove operador do próprio restaurante a gerente', () => {
    expect(podeDefinirPapel(admin, operador, 'gerente').permitido).toBe(true)
  })

  it('gerente não muda papel de ninguém', () => {
    expect(podeDefinirPapel(gerente, operador, 'admin').permitido).toBe(false)
  })

  it('master faz tudo, inclusive promover a master e mexer fora da casa', () => {
    expect(podeDefinirPapel(master, operador, 'master').permitido).toBe(true)
    expect(podeDefinirPapel(master, operadorDeFora, 'admin').permitido).toBe(true)
  })

  it('master pode mudar o próprio papel — é o que o trigger permite', () => {
    expect(podeDefinirPapel(master, master, 'admin').permitido).toBe(true)
  })

  it('manter o papel atual nunca é bloqueado, mesmo para quem não pode editar', () => {
    expect(podeDefinirPapel(gerente, operador, 'operador').permitido).toBe(true)
    expect(podeDefinirPapel(admin, admin, 'admin').permitido).toBe(true)
  })
})

describe('opcoesDePapel', () => {
  it('devolve os quatro papéis, com motivo escrito no que está fechado', () => {
    const opcoes = opcoesDePapel(admin, operador)
    expect(opcoes.map((o) => o.papel)).toEqual(['master', 'admin', 'gerente', 'operador'])

    const masterFechado = opcoes.find((o) => o.papel === 'master')
    expect(masterFechado?.disponivel).toBe(false)
    expect(masterFechado?.motivo.length).toBeGreaterThan(0)

    const gerenteAberto = opcoes.find((o) => o.papel === 'gerente')
    expect(gerenteAberto?.disponivel).toBe(true)
    expect(gerenteAberto?.motivo).toBe('')
  })

  it('para o próprio admin, só o papel atual continua disponível', () => {
    const disponiveis = opcoesDePapel(admin, admin)
      .filter((o) => o.disponivel)
      .map((o) => o.papel)
    expect(disponiveis).toEqual(['admin'])
  })
})

describe('montarAlteracaoDePapel', () => {
  it('promover a master limpa o restaurante — o CHECK do banco exige', () => {
    const { patch, erro } = montarAlteracaoDePapel(master, operador, 'master')
    expect(erro).toBeNull()
    expect(patch).toEqual({ id: 'u-operador', papel: 'master', restaurante_id: null })
  })

  it('rebaixar um master sem escolher restaurante é recusado com o motivo', () => {
    const { patch, erro } = montarAlteracaoDePapel(master, master, 'admin')
    expect(patch).toBeNull()
    expect(erro).toMatch(/restaurante/i)
  })

  it('rebaixar um master com restaurante escolhido monta o update completo', () => {
    const { patch, erro } = montarAlteracaoDePapel(master, master, 'admin', CASA)
    expect(erro).toBeNull()
    expect(patch).toEqual({ id: 'u-master', papel: 'admin', restaurante_id: CASA })
  })

  it('mantém o restaurante do alvo quando nenhum é escolhido', () => {
    const { patch } = montarAlteracaoDePapel(admin, operador, 'gerente')
    expect(patch?.restaurante_id).toBe(CASA)
  })

  it('não monta patch nenhum quando a permissão nega', () => {
    const { patch, erro } = montarAlteracaoDePapel(admin, operador, 'master')
    expect(patch).toBeNull()
    expect(erro).toMatch(/master/i)
  })
})

describe('podeAlternarAtivo', () => {
  it('ninguém desativa o próprio acesso', () => {
    expect(podeAlternarAtivo(admin, admin).permitido).toBe(false)
    expect(podeAlternarAtivo(master, master).permitido).toBe(false)
  })

  it('admin não desativa gente de outro restaurante nem um master', () => {
    expect(podeAlternarAtivo(admin, operadorDeFora).permitido).toBe(false)
    expect(podeAlternarAtivo(admin, master).permitido).toBe(false)
  })

  it('admin desativa a própria equipe; master desativa qualquer um', () => {
    expect(podeAlternarAtivo(admin, operador).permitido).toBe(true)
    expect(podeAlternarAtivo(master, operadorDeFora).permitido).toBe(true)
  })
})

describe('avisoDeAutoAlteracao', () => {
  it('avisa o master que está se rebaixando', () => {
    expect(avisoDeAutoAlteracao(master, master, 'admin')).toMatch(/perde a visão da rede/i)
  })

  it('cala quando o alvo é outra pessoa ou o papel não mudou', () => {
    expect(avisoDeAutoAlteracao(master, operador, 'admin')).toBeNull()
    expect(avisoDeAutoAlteracao(master, master, 'master')).toBeNull()
    expect(avisoDeAutoAlteracao(admin, admin, 'gerente')).toBeNull()
  })
})

/* -------------------------------------------------------------- filtro ---- */

function perfil(parcial: Partial<Perfil> & { id: string; nome: string }): Perfil {
  return {
    restaurante_id: CASA,
    email: `${parcial.id}@exemplo.com.br`,
    telefone: null,
    avatar_url: null,
    papel: 'operador',
    ativo: true,
    convite_aceito_em: null,
    ultimo_acesso_em: null,
    criado_em: '2026-01-01T12:00:00Z',
    atualizado_em: '2026-01-01T12:00:00Z',
    ...parcial,
  }
}

const equipe: Perfil[] = [
  perfil({ id: 'a', nome: 'Antônio Régis', papel: 'admin' }),
  perfil({ id: 'b', nome: 'Beatriz Souza', ativo: false }),
  perfil({ id: 'c', nome: 'Carlos Lima', papel: 'gerente', restaurante_id: OUTRO }),
]

describe('filtrarEquipe', () => {
  it('esconde inativos por padrão', () => {
    const r = filtrarEquipe(equipe, {
      busca: '',
      restauranteId: null,
      papel: null,
      situacao: 'ativos',
    })
    expect(r.map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('acha "Antônio" digitando "antonio", sem acento', () => {
    const r = filtrarEquipe(equipe, {
      busca: 'antonio regis',
      restauranteId: null,
      papel: null,
      situacao: 'todos',
    })
    expect(r.map((p) => p.id)).toEqual(['a'])
  })

  it('combina restaurante e papel', () => {
    const r = filtrarEquipe(equipe, {
      busca: '',
      restauranteId: OUTRO,
      papel: 'gerente',
      situacao: 'todos',
    })
    expect(r.map((p) => p.id)).toEqual(['c'])
  })
})

describe('mensagemDoConvite · o recado que substitui o e-mail que nao existe', () => {
  const BASE = {
    email: 'val@bardozeca.com.br',
    nome: 'Val',
    papel: 'gerente' as const,
    restaurante: 'Bar do Zeca — Norte Shopping',
    expiraEm: '2026-10-07T12:00:00Z',
    endereco: 'https://multiverso.vercel.app',
  }

  it('leva os quatro passos, inclusive o que ninguem adivinha', () => {
    const texto = mensagemDoConvite(BASE)
    expect(texto).toContain('https://multiverso.vercel.app')
    expect(texto).toContain('Tenho um convite')
    expect(texto).toContain('val@bardozeca.com.br')
    expect(texto).toContain('senha')
  })

  it('diz o papel e o restaurante', () => {
    const texto = mensagemDoConvite(BASE)
    expect(texto).toContain('gerente')
    expect(texto).toContain('Bar do Zeca — Norte Shopping')
  })

  it('diz ate quando o convite vale', () => {
    // Convite vencido e a segunda causa mais comum de "nao consigo entrar".
    expect(mensagemDoConvite(BASE)).toContain('07/10/2026')
  })

  it('sem nome, cumprimenta assim mesmo', () => {
    const texto = mensagemDoConvite({ ...BASE, nome: null })
    expect(texto.startsWith('Oi! ')).toBe(true)
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
  })

  it('sem restaurante (convite de master), nao inventa um', () => {
    const texto = mensagemDoConvite({ ...BASE, papel: 'master', restaurante: null })
    expect(texto).toContain('Gestão de Restaurantes, como master')
    expect(texto).not.toContain(' no ,')
  })

  it('data invalida nao vira "Invalid Date" no recado', () => {
    const texto = mensagemDoConvite({ ...BASE, expiraEm: 'nao é data' })
    expect(texto).not.toContain('Invalid')
    expect(texto).not.toContain('vale até')
  })

  it('nao promete e-mail em lugar nenhum', () => {
    // A promessa implicita foi o defeito: dois convites criados, ninguem
    // avisado, e quem convidou esperando uma mensagem que nunca sairia.
    const texto = mensagemDoConvite(BASE).toLowerCase()
    expect(texto).not.toContain('enviamos')
    expect(texto).not.toContain('verifique sua caixa')
  })
})

describe('normalizarTelefone · o wa.me nao perdoa', () => {
  it('celular com DDD ganha o 55', () => {
    expect(normalizarTelefone('11999998888')).toBe('5511999998888')
  })

  it('fixo com DDD tambem', () => {
    expect(normalizarTelefone('1133334444')).toBe('551133334444')
  })

  it('o que a pessoa digita de verdade', () => {
    // Parenteses, espaco e traco sao o normal de quem copia da agenda. Sem
    // limpar, o link abre uma conversa com ninguem — e em silencio.
    expect(normalizarTelefone('(11) 99999-8888')).toBe('5511999998888')
    expect(normalizarTelefone('+55 11 99999-8888')).toBe('5511999998888')
    expect(normalizarTelefone(' 11 9 9999 8888 ')).toBe('5511999998888')
  })

  it('numero que ja veio com DDI nao ganha outro', () => {
    expect(normalizarTelefone('5511999998888')).toBe('5511999998888')
    expect(normalizarTelefone('551133334444')).toBe('551133334444')
  })

  it('o zero de operadora sai', () => {
    expect(normalizarTelefone('055 11 99999-8888')).toBe('5511999998888')
  })

  it('vazio e lixo devolvem null, e a tela nao oferece o botao', () => {
    // Melhor nao oferecer do que abrir a conversa errada.
    expect(normalizarTelefone('')).toBeNull()
    expect(normalizarTelefone(null)).toBeNull()
    expect(normalizarTelefone('abc')).toBeNull()
    expect(normalizarTelefone('123')).toBeNull()
  })

  it('numero de outro pais passa inteiro', () => {
    expect(normalizarTelefone('+351 912 345 678')).toBe('351912345678')
  })
})

describe('telefoneLegivel', () => {
  it('celular brasileiro sai formatado', () => {
    expect(telefoneLegivel('11999998888')).toBe('+55 (11) 99999-8888')
  })

  it('fixo tem o corte no lugar certo', () => {
    expect(telefoneLegivel('1133334444')).toBe('+55 (11) 3333-4444')
  })

  it('estrangeiro nao vira endereco brasileiro', () => {
    expect(telefoneLegivel('+351 912 345 678')).toBe('+351912345678')
  })

  it('sem telefone, nada', () => {
    expect(telefoneLegivel(null)).toBeNull()
  })
})

describe('linkDoWhatsapp', () => {
  const RECADO = 'Oi, Val! Você foi convidado — acesse https://x.app'

  it('monta o click-to-chat com a mensagem escapada', () => {
    const link = linkDoWhatsapp('(11) 99999-8888', RECADO)
    expect(link).toContain('https://wa.me/5511999998888?text=')
    expect(link).toContain(encodeURIComponent(RECADO))
  })

  it('acento e quebra de linha sobrevivem a viagem', () => {
    const link = linkDoWhatsapp('11999998888', 'Olá\nção')!
    const texto = decodeURIComponent(link.split('text=')[1]!)
    expect(texto).toBe('Olá\nção')
  })

  it('sem telefone confiavel, sem link', () => {
    expect(linkDoWhatsapp('', RECADO)).toBeNull()
    expect(linkDoWhatsapp('123', RECADO)).toBeNull()
  })
})
