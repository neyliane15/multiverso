import { describe, expect, it } from 'vitest'
import {
  casarCompraDaPlanilha,
  casarVendaDaPlanilha,
  fatorParaInsumo,
  pareceServico,
  sugerirAlvos,
  type FichaCandidata,
} from './dePara'

const ficha = (id: string, nome: string, extra: Partial<FichaCandidata> = {}): FichaCandidata => ({
  id,
  nome,
  producao: false,
  ativo: true,
  preco_venda: 0,
  ...extra,
})

const produtos = [
  { id: 'p1', nome: 'CERVEJA ANTARCTICA ORIGINAL (600ml)' },
  { id: 'p2', nome: 'CERVEJA AMSTEL (600ml)' },
  { id: 'p3', nome: 'LEITE CONDENSADO' },
]

const fichas = [
  ficha('f1', 'CAIPIRINHA DE LIMÃO'),
  ficha('f2', 'AMSTEL CHOPP 300 ML'),
  ficha('f3', 'AMSTEL CHOPP 300 ML HH'),
  ficha('f4', 'XAROPE SIMPLES', { producao: true }),
  ficha('f5', 'DRINQUE ANTIGO', { ativo: false }),
]

describe('casarCompraDaPlanilha', () => {
  it('vincula pelo nome idêntico, ignorando acento e pontuação', () => {
    const casamento = casarCompraDaPlanilha('leite condensado', { produtos })
    expect(casamento.produtoId).toBe('p3')
    expect(casamento.motivo).toBe('nome_identico')
  })

  it('vincula pelo apelido que alguém já ensinou à mão', () => {
    const casamento = casarCompraDaPlanilha('PICANHA BOV RESF KG', {
      produtos,
      apelidos: [{ produto_id: 'p1', apelido: 'PICANHA BOV RESF KG', fator_conversao: 12 }],
    })
    expect(casamento.produtoId).toBe('p1')
    expect(casamento.motivo).toBe('apelido')
    expect(casamento.fatorSugerido).toBe(12)
  })

  /**
   * O degrau que este módulo existe para trancar. `casarItem` vincula sozinho a
   * partir de 72% de parecença; aqui ele nunca vincula. "ANTARTICA ORIG600 ML"
   * é mesmo a Antarctica do cadastro — e mesmo assim fica pendente, porque o
   * que separa esse acerto de um erro é só sorte de grafia.
   */
  it('nunca vincula por parecença, nem quando a parecença é alta', () => {
    const casamento = casarCompraDaPlanilha('ANTARTICA ORIG600 ML', { produtos })
    expect(casamento.produtoId).toBeNull()
    expect(casamento.motivo).toBe('pendente')
  })

  it('nome que bate com dois cadastros fica pendente', () => {
    const casamento = casarCompraDaPlanilha('COCA COLA', {
      produtos: [
        { id: 'a', nome: 'COCA-COLA' },
        { id: 'b', nome: 'COCA COLA' },
      ],
    })
    expect(casamento.produtoId).toBeNull()
  })
})

describe('casarVendaDaPlanilha', () => {
  it('ficha de nome igual vem antes do insumo', () => {
    const casamento = casarVendaDaPlanilha('Caipirinha de Limão', { fichas, produtos })
    expect(casamento.alvo).toBe('ficha')
    expect(casamento.fichaId).toBe('f1')
    expect(casamento.produtoId).toBeNull()
  })

  /**
   * A decisão da cliente: "garrafa é produto fechado vendido inteiro, dose é
   * apenas uma pequena quantidade". Sem ficha com aquele nome, a venda aponta
   * direto no insumo.
   */
  it('sem ficha, o nome igual ao do insumo aponta direto para o insumo', () => {
    const casamento = casarVendaDaPlanilha('CERVEJA AMSTEL (600ml)', { fichas, produtos })
    expect(casamento.alvo).toBe('produto')
    expect(casamento.produtoId).toBe('p2')
    expect(casamento.fichaId).toBeNull()
  })

  /**
   * A armadilha medida na planilha: `AMSTEL 600 ML`, `AMSTEL CHOPP 300 ML` e
   * `AMSTEL CHOPP 300 ML HH` são três coisas diferentes, e as duas últimas se
   * separam por duas letras. R$ 16.633,21 e R$ 7.023,92 em jogo.
   */
  it('AMSTEL 600 ML não casa com AMSTEL CHOPP 300 ML nem com a HH', () => {
    const casamento = casarVendaDaPlanilha('AMSTEL 600 ML', { fichas, produtos })
    expect(casamento.alvo).toBe('pendente')
    expect(casamento.fichaId).toBeNull()
    expect(casamento.produtoId).toBeNull()
  })

  it('a ficha de produção não é candidata: produção não se vende', () => {
    const casamento = casarVendaDaPlanilha('XAROPE SIMPLES', { fichas, produtos })
    expect(casamento.alvo).toBe('pendente')
  })

  it('ficha arquivada também não', () => {
    const casamento = casarVendaDaPlanilha('DRINQUE ANTIGO', { fichas, produtos })
    expect(casamento.alvo).toBe('pendente')
  })

  /**
   * Serviço é AFIRMAÇÃO ("isto não consome nada"), e por isso a lista de
   * palavras acende o atalho sem fazer o vínculo. R$ 53.049,68 de setembro
   * passam por aqui — e um bar que batize um prato de "TAXA DO CHEF" não pode
   * perder o custo dele por causa de uma lista nossa.
   */
  it('nome com cara de serviço fica pendente, mas acende o atalho', () => {
    const casamento = casarVendaDaPlanilha('COUVERT ARTISTICO 20 REAIS', { fichas, produtos })
    expect(casamento.alvo).toBe('pendente')
    expect(casamento.pareceServico).toBe(true)
    expect(casamento.motivo).toBe('servico_sugerido')
    expect(casamento.explicacao).toMatch(/não consome insumo/)
  })

  it('o apelido aprendido vale para serviço também, e aí sim vincula', () => {
    const casamento = casarVendaDaPlanilha('Taxa de serviço', {
      fichas,
      produtos,
      apelidos: [{ apelido: 'Taxa de serviço', alvo: 'servico', ficha_id: null, produto_id: null }],
    })
    expect(casamento.alvo).toBe('servico')
    expect(casamento.motivo).toBe('apelido')
  })

  it('o apelido aprendido sobrepõe a parecença e o nome idêntico', () => {
    const casamento = casarVendaDaPlanilha('AMSTEL 600 ML', {
      fichas,
      produtos,
      apelidos: [{ apelido: 'amstel 600 ml', alvo: 'produto', ficha_id: null, produto_id: 'p2' }],
    })
    expect(casamento.alvo).toBe('produto')
    expect(casamento.produtoId).toBe('p2')
  })

  it('BUFFET DE FEIJOADA não casa com nada e não inventa ficha', () => {
    const casamento = casarVendaDaPlanilha('BUFFET DE FEIJOADA', { fichas, produtos })
    expect(casamento.alvo).toBe('pendente')
    expect(casamento.pareceServico).toBe(false)
  })
})

describe('pareceServico', () => {
  it('reconhece couvert, taxa de serviço e rolha', () => {
    expect(pareceServico('COUVERT ARTISTICO 40')).toBe(true)
    expect(pareceServico('Taxa de serviço')).toBe(true)
    expect(pareceServico('TAXA ROLHA')).toBe(true)
    expect(pareceServico('ISCA DE FRANGO A MILANESA')).toBe(false)
    expect(pareceServico('AMSTEL 600 ML')).toBe(false)
  })
})

describe('sugerirAlvos', () => {
  it('ordena ficha e insumo juntos, do mais parecido ao menos', () => {
    const sugestoes = sugerirAlvos('AMSTEL CHOPP 300 ML', { fichas, produtos })
    expect(sugestoes[0]).toMatchObject({ tipo: 'ficha', id: 'f2' })
    expect(sugestoes.map((s) => s.confianca)).toEqual([...sugestoes.map((s) => s.confianca)].sort((a, b) => b - a))
  })

  it('não sugere produção nem ficha arquivada', () => {
    const sugestoes = sugerirAlvos('XAROPE SIMPLES', { fichas, produtos })
    expect(sugestoes.find((s) => s.id === 'f4')).toBeUndefined()
    expect(sugestoes.find((s) => s.id === 'f5')).toBeUndefined()
  })
})

/**
 * O gêmeo em TypeScript de `mv_fator_para_produto`, que existe para a tela
 * avisar ANTES do clique.
 *
 * Os dois primeiros casos são da planilha de setembro contra o catálogo do
 * primeiro cliente, e são os dois botões de um clique que criavam linha sem
 * conversão: `PASTEL DE CAMARAO UND` (vendido em UN) para o insumo contado em
 * KG, e `CARNE SECA COM AIPIM` (em UN) para outro insumo em KG.
 */
describe('fatorParaInsumo', () => {
  it('recusa converter UN para KG, que é o clique que estragava a conta', () => {
    expect(fatorParaInsumo('UN', { unidade: 'KG' })).toBeNull()
    expect(fatorParaInsumo('KG', { unidade: 'UND' })).toBeNull()
  })

  it('converte dentro da família, e aceita o sinônimo do PDV', () => {
    expect(fatorParaInsumo('KG', { unidade: 'KG' })).toBe(1)
    // "UN" do PDV e "UND" do cadastro são a mesma unidade.
    expect(fatorParaInsumo('UN', { unidade: 'UND' })).toBe(1)
    expect(fatorParaInsumo('G', { unidade: 'KG' })).toBe(0.001)
  })

  it('converte pela embalagem quando o insumo diz quanto cabe nela', () => {
    expect(
      fatorParaInsumo('KG', { unidade: 'UND', conteudo_quantidade: 5, conteudo_unidade: 'KG' }),
    ).toBe(0.2)
    expect(
      fatorParaInsumo('ML', { unidade: 'UND', conteudo_quantidade: 965, conteudo_unidade: 'ML' }),
    ).toBeCloseTo(1 / 965, 8)
  })

  it('sem unidade dita, a quantidade já está na unidade do insumo', () => {
    // É o que o lançamento feito à mão sempre significou.
    expect(fatorParaInsumo(null, { unidade: 'KG' })).toBe(1)
    expect(fatorParaInsumo(undefined, { unidade: 'UND' })).toBe(1)
  })
})
