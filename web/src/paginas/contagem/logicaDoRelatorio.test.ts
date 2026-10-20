import { describe, expect, it } from 'vitest'
import type { LinhaDoRelatorio } from '@/tipos/banco'
import {
  categoriasDoRelatorio,
  explicacaoDoZeroLido,
  filtrarRelatorio,
  julgarSugestao,
  ordenarRelatorio,
  resumoDoRelatorio,
  temPendencia,
} from './logicaDoRelatorio'

function linha(parcial: Partial<LinhaDoRelatorio> & { produto_nome: string }): LinhaDoRelatorio {
  return {
    produto_id: `p-${parcial.produto_nome}`,
    categoria_id: 'c-secos',
    categoria_nome: 'Secos',
    unidade: 'KG',
    contagem_anterior: 20,
    compras: 10,
    vendas: 15,
    contagem_atual: 12,
    consumo: 18,
    ideal: 15,
    diferenca: -3,
    media_3_vendas: 10,
    vendas_consideradas: 3,
    sugestao: 0,
    precisa_comprar: false,
    custo_unitario: 5,
    pendencia: null,
    anterior_lido_como_zero: false,
    atual_lido_como_zero: false,
    vendas_com_saida: 3,
    ...parcial,
  }
}

describe('julgarSugestao · os três estados da regra', () => {
  it('contagem atual MAIOR que a média: não precisa comprar', () => {
    const julgado = julgarSugestao(
      linha({ produto_nome: 'Farinha', contagem_atual: 12, media_3_vendas: 10, precisa_comprar: false, sugestao: 0 }),
    )
    expect(julgado.veredito).toBe('tem_de_sobra')
    expect(julgado.rotulo).toBe('Não precisa comprar')
    expect(julgado.quantidade).toBeNull()
  })

  it('contagem atual MENOR que a média: sugere a diferença', () => {
    const julgado = julgarSugestao(
      linha({ produto_nome: 'Cebola', contagem_atual: 2, media_3_vendas: 7.8125, precisa_comprar: true, sugestao: 5.8125 }),
    )
    expect(julgado.veredito).toBe('comprar')
    expect(julgado.rotulo).toBe('Comprar')
    expect(julgado.quantidade).toBe(5.8125)
  })

  /**
   * A borda que a cliente pediu para ver decidida.
   *
   * A regra dela é "se a contagem atual for MAIOR que a média, não precisa
   * comprar". No empate ela NÃO é maior, então cai no outro lado: precisa
   * comprar — e a quantidade a comprar é exatamente zero. A tela diz "no
   * limite da média" em vez de "Comprar 0", porque mandar comprar zero é
   * ruído, e dizer que está de sobra seria falso.
   */
  it('EMPATE: precisa comprar, mas a quantidade é zero e a tela explica', () => {
    const julgado = julgarSugestao(
      linha({ produto_nome: 'Azeite', contagem_atual: 2, media_3_vendas: 2, precisa_comprar: true, sugestao: 0 }),
    )
    expect(julgado.veredito).toBe('comprar')
    expect(julgado.quantidade).toBe(0)
    expect(julgado.rotulo).toBe('No limite da média')
    expect(julgado.motivo).toBe('O estoque empata com a média: não sobra folga.')
  })

  /**
   * A segunda borda: média inexistente.
   *
   * Sem venda fechada nenhuma não há média, e as duas respostas possíveis de
   * um `if/else` seriam erradas. "Não precisa comprar" manda a casa para a
   * semana seguinte sem estoque; "comprar a média" inventaria um número a
   * partir de nada. O estado é um terceiro, e ele tem nome.
   */
  it('MÉDIA NULA por falta de venda: não se sabe, e o motivo diz por quê', () => {
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'Açúcar',
        media_3_vendas: null,
        precisa_comprar: null,
        sugestao: null,
        vendas_consideradas: 0,
      }),
    )
    expect(julgado.veredito).toBe('sem_base')
    expect(julgado.rotulo).toBe('Não se sabe')
    expect(julgado.quantidade).toBeNull()
    expect(julgado.motivo).toBe('Nenhuma venda fechada até a data desta contagem.')
  })

  it('MÉDIA NULA por unidade sem conversão: outro motivo, mesmo estado', () => {
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'Limão',
        media_3_vendas: null,
        precisa_comprar: null,
        sugestao: null,
        vendas_consideradas: 3,
        pendencia: 'Limao entra em Caipirinha em G, que nao converte',
      }),
    )
    expect(julgado.veredito).toBe('sem_base')
    expect(julgado.motivo).toBe('Algum insumo desta venda está sem conversão de unidade.')
  })

  /**
   * A terceira causa de "não se sabe", e a mais comum na carga real.
   *
   * O banco anula `precisa_comprar` tambem quando a CONTAGEM ATUAL e nula —
   * ou seja, quando a folha lancou o item numa unidade que nao converte para
   * a de compra. Nesse caso a venda esta certa e a ficha esta certa; o que
   * precisa de conserto e a folha. Medido no relatorio de 01/10 do Bar do
   * Zeca: as 5 linhas "Nao se sabe" eram TODAS deste caso (APERITIVO DE
   * CARNE contado em UND com produto cadastrado em KG, NHOQUE 150gr contado
   * em KG com produto em UND), e o motivo mandava olhar a ficha.
   */
  it('CONTAGEM ATUAL nula: o motivo aponta a FOLHA, nao a venda', () => {
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'APERITIVO DE CARNE (ALCATRA)',
        contagem_atual: null,
        vendas: 0,
        media_3_vendas: 0,
        precisa_comprar: null,
        sugestao: null,
        vendas_consideradas: 3,
        pendencia: 'a contagem lancou este item em UND, que nao converte para KG',
      }),
    )
    expect(julgado.veredito).toBe('sem_base')
    expect(julgado.rotulo).toBe('Não se sabe')
    expect(julgado.quantidade).toBeNull()
    expect(julgado.motivo).toBe(
      'A contagem lançou este item em unidade que não converte para a de compra.',
    )
  })

  it('média zero NÃO é média nula: nada vendido é resposta, e a resposta é não comprar', () => {
    const julgado = julgarSugestao(
      linha({ produto_nome: 'Vela', contagem_atual: 5, media_3_vendas: 0, precisa_comprar: false, sugestao: 0 }),
    )
    expect(julgado.veredito).toBe('tem_de_sobra')
  })

  /**
   * Estoque zero contra média zero também é empate, e o banco o marca como
   * `precisa_comprar = true` — mas a tela não o chama de compra. Ver o bloco
   * "o empate em zero é um sub-caso com nome", mais abaixo: a sugestão
   * continua zero, a linha continua inteira, e o que muda é só o nome do
   * estado, para que quinhentas linhas de nada parem de parecer decisão
   * pendente.
   */
  it('estoque zerado com média zero não vira compra: vira "sem movimento"', () => {
    const julgado = julgarSugestao(
      linha({ produto_nome: 'Vela', contagem_atual: 0, media_3_vendas: 0, precisa_comprar: true, sugestao: 0 }),
    )
    expect(julgado.veredito).toBe('sem_movimento')
    expect(julgado.quantidade).toBeNull()
  })
})

/* ──────────────────────────────────────────────────── filtro e ordem ───── */

const RELATORIO: LinhaDoRelatorio[] = [
  linha({ produto_nome: 'Farinha', precisa_comprar: false, sugestao: 0, diferenca: -3, consumo: 18 }),
  linha({
    produto_nome: 'Cebola',
    precisa_comprar: true,
    sugestao: 5.8125,
    media_3_vendas: 7.8125,
    contagem_atual: 2,
    diferenca: 8.71875,
    consumo: 3,
    custo_unitario: 10,
  }),
  linha({
    produto_nome: 'Limão',
    categoria_id: 'c-bar',
    categoria_nome: 'Bar',
    precisa_comprar: null,
    sugestao: null,
    media_3_vendas: null,
    vendas: null,
    ideal: null,
    diferenca: null,
    consumo: 0,
    pendencia: 'Limao entra em Caipirinha em G, que nao converte',
  }),
  linha({
    produto_nome: 'Vodka',
    categoria_id: 'c-bar',
    categoria_nome: 'Bar',
    precisa_comprar: false,
    sugestao: 0,
    diferenca: 7,
    consumo: 2,
    unidade: 'UND',
    custo_unitario: 60,
  }),
]

describe('filtrarRelatorio', () => {
  it('busca sem acento, no insumo e na categoria', () => {
    expect(filtrarRelatorio(RELATORIO, { busca: 'limao' }).map((l) => l.produto_nome)).toEqual([
      'Limão',
    ])
    expect(filtrarRelatorio(RELATORIO, { busca: 'bar' }).map((l) => l.produto_nome)).toEqual([
      'Limão',
      'Vodka',
    ])
  })

  it('filtra por categoria', () => {
    expect(
      filtrarRelatorio(RELATORIO, { categoriaId: 'c-secos' }).map((l) => l.produto_nome),
    ).toEqual(['Farinha', 'Cebola'])
  })

  /**
   * "Só o que precisa comprar" inclui o NÃO SE SABE de propósito: a lista
   * existe para fechar o pedido da semana, e a linha sem resposta é a que mais
   * precisa de olho humano antes de o pedido sair.
   */
  it('"só precisa comprar" guarda também as linhas sem resposta', () => {
    expect(
      filtrarRelatorio(RELATORIO, { soPrecisaComprar: true }).map((l) => l.produto_nome),
    ).toEqual(['Cebola', 'Limão'])
  })

  it('"só com pendência" deixa apenas as linhas que têm algo a dizer', () => {
    expect(
      filtrarRelatorio(RELATORIO, { soComPendencia: true }).map((l) => l.produto_nome),
    ).toEqual(['Limão'])
  })

  it('os filtros se somam', () => {
    expect(
      filtrarRelatorio(RELATORIO, { categoriaId: 'c-bar', soPrecisaComprar: true }).map(
        (l) => l.produto_nome,
      ),
    ).toEqual(['Limão'])
  })
})

describe('ordenarRelatorio', () => {
  it('por nome, em pt-BR', () => {
    expect(ordenarRelatorio(RELATORIO, 'nome').map((l) => l.produto_nome)).toEqual([
      'Cebola',
      'Farinha',
      'Limão',
      'Vodka',
    ])
  })

  it('por diferença, pela MAGNITUDE: −8 pesa tanto quanto +8', () => {
    expect(ordenarRelatorio(RELATORIO, 'diferenca').map((l) => l.produto_nome)).toEqual([
      'Cebola',
      'Vodka',
      'Farinha',
      'Limão',
    ])
  })

  it('nulo desce para o fim, nunca para o meio como se fosse zero', () => {
    const ordenado = ordenarRelatorio(RELATORIO, 'sugestao')
    expect(ordenado[0]!.produto_nome).toBe('Cebola')
    expect(ordenado[ordenado.length - 1]!.produto_nome).toBe('Limão')
  })

  it('por consumo, do maior para o menor', () => {
    expect(ordenarRelatorio(RELATORIO, 'consumo').map((l) => l.produto_nome)).toEqual([
      'Farinha',
      'Cebola',
      'Vodka',
      'Limão',
    ])
  })

  it('não altera o array que recebeu', () => {
    const antes = RELATORIO.map((l) => l.produto_nome)
    ordenarRelatorio(RELATORIO, 'diferenca')
    expect(RELATORIO.map((l) => l.produto_nome)).toEqual(antes)
  })
})

describe('resumoDoRelatorio', () => {
  it('conta os três vereditos', () => {
    const resumo = resumoDoRelatorio(RELATORIO)
    expect([resumo.insumos, resumo.precisamComprar, resumo.temDeSobra, resumo.semBase]).toEqual([
      4, 1, 2, 1,
    ])
  })

  it('o valor sugerido usa o custo congelado da foto', () => {
    // Só a cebola sugere compra: 5,8125 KG × R$ 10 = R$ 58,125.
    expect(resumoDoRelatorio(RELATORIO).valorSugerido).toBeCloseTo(58.125, 10)
  })

  /**
   * A falta soma só as diferenças NEGATIVAS. Somar as duas direções daria um
   * número que se anula, e a sobra de cebola não paga a falta de farinha: são
   * dois problemas diferentes, e só um deles custa dinheiro hoje.
   */
  it('a falta soma só o que faltou, e não se anula com a sobra', () => {
    // Farinha: |−3| × R$ 5 = R$ 15. A cebola (+8,71875) e a vodka (+7) não entram.
    expect(resumoDoRelatorio(RELATORIO).valorDaFalta).toBeCloseTo(15, 10)
  })

  it('conta as pendências', () => {
    expect(resumoDoRelatorio(RELATORIO).comPendencia).toBe(1)
  })

  it('relatório vazio não quebra', () => {
    const resumo = resumoDoRelatorio([])
    expect([resumo.insumos, resumo.valorSugerido, resumo.valorDaFalta]).toEqual([0, 0, 0])
  })
})

describe('categoriasDoRelatorio', () => {
  it('sai do próprio relatório, com a contagem de linhas', () => {
    expect(categoriasDoRelatorio(RELATORIO)).toEqual([
      { id: 'c-bar', nome: 'Bar', linhas: 2 },
      { id: 'c-secos', nome: 'Secos', linhas: 2 },
    ])
  })

  it('insumo sem categoria ganha o balde próprio', () => {
    expect(
      categoriasDoRelatorio([
        linha({ produto_nome: 'Guardanapo', categoria_id: null, categoria_nome: null }),
      ]),
    ).toEqual([{ id: null, nome: 'Sem categoria', linhas: 1 }])
  })
})

describe('filtrarRelatorio · o balde "Sem categoria" é alcançável', () => {
  const comBalde = [
    ...RELATORIO,
    linha({ produto_nome: 'Guardanapo', categoria_id: null, categoria_nome: null }),
  ]

  it('sem o campo, traz tudo', () => {
    expect(filtrarRelatorio(comBalde)).toHaveLength(5)
  })

  it('`null` filtra o balde, e não desliga o filtro', () => {
    expect(filtrarRelatorio(comBalde, { categoriaId: null }).map((l) => l.produto_nome)).toEqual([
      'Guardanapo',
    ])
  })

  it('uma categoria de verdade continua filtrando ela', () => {
    expect(filtrarRelatorio(comBalde, { categoriaId: 'c-bar' }).map((l) => l.produto_nome)).toEqual(
      ['Limão', 'Vodka'],
    )
  })
})

/**
 * O empate em ZERO.
 *
 * A regra da cliente é literal e o banco a aplica ao pé da letra: estoque 0
 * contra média 0 é `precisa_comprar = true` com sugestão 0. Tecnicamente
 * certo, e inútil na tela — medido na carga real do Bar do Zeca, 882 linhas
 * viravam 538 "precisa comprar", quase todas de insumo que não foi vendido e
 * não está em estoque. A tela nomeia o sub-caso sem mudar número nenhum.
 */
describe('julgarSugestao · o empate em zero é um sub-caso com nome', () => {
  const parado = linha({
    produto_nome: 'Abacate',
    contagem_anterior: 0,
    compras: 0,
    vendas: 0,
    contagem_atual: 0,
    consumo: 0,
    ideal: 0,
    diferenca: 0,
    media_3_vendas: 0,
    precisa_comprar: true,
    sugestao: 0,
  })

  it('não foi vendido e não está em estoque: sem movimento', () => {
    const julgado = julgarSugestao(parado)
    expect(julgado.veredito).toBe('sem_movimento')
    expect(julgado.rotulo).toBe('Sem movimento')
    expect(julgado.quantidade).toBeNull()
    expect(julgado.motivo).toBe('Não foi vendido e não está em estoque.')
  })

  it('o empate em número continua sendo "no limite da média"', () => {
    expect(
      julgarSugestao(
        linha({
          produto_nome: 'Azeite',
          contagem_atual: 2,
          media_3_vendas: 2,
          precisa_comprar: true,
          sugestao: 0,
        }),
      ).veredito,
    ).toBe('comprar')
  })

  it('estoque sem venda nenhuma NÃO é sem movimento — tem o que sobrar', () => {
    expect(
      julgarSugestao(
        linha({
          produto_nome: 'Vela',
          contagem_atual: 5,
          media_3_vendas: 0,
          precisa_comprar: false,
          sugestao: 0,
        }),
      ).veredito,
    ).toBe('tem_de_sobra')
  })

  it('o resumo conta o sem movimento à parte, e ele não infla a compra', () => {
    const resumo = resumoDoRelatorio([...RELATORIO, parado])
    expect(resumo.semMovimento).toBe(1)
    expect(resumo.precisamComprar).toBe(1)
    expect(resumo.insumos).toBe(5)
  })

  it('"só o que comprar" não traz o sem movimento', () => {
    expect(
      filtrarRelatorio([...RELATORIO, parado], { soPrecisaComprar: true }).map(
        (l) => l.produto_nome,
      ),
    ).toEqual(['Cebola', 'Limão'])
  })
})

/**
 * O zero que ninguém contou (0026).
 *
 * O banco devolve `contagem_atual = 0` quando o insumo não está na folha de
 * hoje, e passou a marcar isso em coluna. Medido na carga real do Bar do Zeca:
 * 36 linhas assim, TODAS as 36 marcadas "precisa comprar", com R$ 309,97 de
 * compra sugerida — 73% de tudo que a tela mandava comprar — em cima de um
 * estoque que ninguém mediu.
 */
describe('o zero lido por ausência na folha', () => {
  it('o estoque de hoje não medido não vira "comprar": vira "não se sabe"', () => {
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'Xarope de maracujá',
        contagem_atual: 0,
        atual_lido_como_zero: true,
        media_3_vendas: 1.32,
        // o banco já devolve os dois nulos; a tela não pode inventá-los de volta
        sugestao: null,
        precisa_comprar: null,
      }),
    )
    expect(julgado.veredito).toBe('sem_base')
    expect(julgado.motivo).toMatch(/não está na folha desta contagem/i)
    expect(julgado.quantidade).toBeNull()
  })

  it('o motivo aponta para CONTAR o insumo, e não para a ficha nem para a venda', () => {
    // É a mesma armadilha que o terceiro caso já tinha: o encadeamento de
    // `if` cai no motivo errado quando a causa nova não vem primeiro.
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'Espuma de gengibre',
        atual_lido_como_zero: true,
        contagem_atual: 0,
        vendas_consideradas: 3,
        sugestao: null,
        precisa_comprar: null,
      }),
    )
    expect(julgado.motivo).not.toMatch(/ficha|venda/i)
    expect(julgado.motivo).toMatch(/estoque de hoje não foi medido/i)
  })

  it('zero CONTADO continua respondendo a regra da cliente, sem marca nenhuma', () => {
    const julgado = julgarSugestao(
      linha({
        produto_nome: 'Sal',
        contagem_atual: 0,
        atual_lido_como_zero: false,
        media_3_vendas: 2,
        sugestao: 2,
        precisa_comprar: true,
      }),
    )
    expect(julgado.veredito).toBe('comprar')
    expect(julgado.quantidade).toBe(2)
  })

  it('a marca conta como pendência — no filtro e no resumo', () => {
    const marcada = linha({
      produto_nome: 'Xarope de uva',
      pendencia: null,
      atual_lido_como_zero: true,
      sugestao: null,
      precisa_comprar: null,
    })
    const limpa = linha({ produto_nome: 'Arroz' })
    expect(temPendencia(marcada)).toBe(true)
    expect(temPendencia(limpa)).toBe(false)
    expect(filtrarRelatorio([marcada, limpa], { soComPendencia: true })).toHaveLength(1)
    expect(resumoDoRelatorio([marcada, limpa]).comPendencia).toBe(1)
  })

  it('a explicação da marca nomeia a ponta certa', () => {
    expect(explicacaoDoZeroLido('anterior')).toMatch(/contagem anterior/i)
    expect(explicacaoDoZeroLido('atual')).toMatch(/desta contagem/i)
    for (const ponta of ['anterior', 'atual'] as const) {
      expect(explicacaoDoZeroLido(ponta)).toMatch(/não é uma medida/i)
    }
  })
})
