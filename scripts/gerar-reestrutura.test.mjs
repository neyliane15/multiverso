// ============================================================================
// Multiverso · teste da reestrutura de setores do Bar do Zeca (sem banco)
// ----------------------------------------------------------------------------
// As regras que decidem o destino de 868 vinculos. O SQL gerado tem um bloco
// de conferencia que roda contra o Postgres; estes testes trancam as DECISOES
// antes disso — em especial a de nao perder nenhum custo na juncao.
// ============================================================================

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ARQUIVADOS,
  DESTINO,
  POR_CATEGORIA,
  RENOMEADO,
  SETORES_FINAIS,
  destinoDoVinculo,
  montarPlano,
  nomeDesdobrado,
} from './gerar-reestrutura.mjs'
import { ORIGEM_JSON } from './gerar-seed.mjs'

const dados = JSON.parse(readFileSync(ORIGEM_JSON, 'utf8'))
const plano = montarPlano(dados)
const sql = readFileSync(DESTINO, 'utf8')

describe('destinoDoVinculo · para onde vai cada vinculo', () => {
  it('o Bar nao se mexe', () => {
    expect(destinoDoVinculo('Bar', 'BEBIDAS ALCOÓLICAS')).toBe('Bar')
    // Nem mesmo se a categoria fosse de limpeza: o bar e uma area propria.
    expect(destinoDoVinculo('Bar', 'MATERIAL DE LIMPEZA')).toBe('Bar')
  })

  it('a categoria manda em Limpeza e Descartaveis', () => {
    expect(destinoDoVinculo('Estoque Geral', 'MATERIAL DE LIMPEZA')).toBe('Limpeza')
    expect(destinoDoVinculo('Estoque Geral', 'DESCARTÁVEIS')).toBe('Descartáveis')
  })

  it('todo o resto vira Cozinha, venha do setor que vier', () => {
    for (const setor of ARQUIVADOS.concat('Estoque Geral')) {
      expect(destinoDoVinculo(setor, 'CARNES')).toBe('Cozinha')
    }
  })

  it('os quatro destinos possiveis sao exatamente os quatro setores finais', () => {
    const destinos = new Set()
    for (const produto of dados.produtos) {
      for (const ocorrencia of produto.setores) {
        destinos.add(destinoDoVinculo(ocorrencia.setor, ocorrencia.categoria))
      }
    }
    expect([...destinos].sort()).toEqual([...SETORES_FINAIS].sort())
  })
})

describe('nomeDesdobrado · como o produto separado se chama', () => {
  it('a categoria distingue, quando ela difere', () => {
    // O catalogo ja tem BACON e BACON (FEIJOADA); o padrao e o mesmo.
    expect(nomeDesdobrado('BACON', 'SUÍNOS', 'EMBUTIDOS')).toBe('BACON (SUÍNOS)')
  })

  it('mesma categoria nos dois lados: o que separa e a porcao', () => {
    expect(nomeDesdobrado('FILÉ DE TILÁPIA', 'PEIXES E FRUTOS DO MAR', 'PEIXES E FRUTOS DO MAR'))
      .toBe('FILÉ DE TILÁPIA (PORCIONADO)')
  })
})

describe('montarPlano · o desdobramento', () => {
  it('desdobra os 14 produtos que a planilha lista em dois setores', () => {
    expect(plano.desdobrar).toHaveLength(14)
  })

  it('nenhum custo se perde: cada ocorrencia vira uma linha propria', () => {
    // A conta que importa. Cada produto x setor da planilha (fora as repetidas
    // no mesmo setor) tem de continuar existindo como um vinculo depois da
    // mudanca — 868 antes, 868 depois.
    const pares = new Set()
    for (const produto of dados.produtos) {
      for (const ocorrencia of produto.setores) pares.add(`${produto.nome}|${ocorrencia.setor}`)
    }
    expect(pares.size).toBe(868)
  })

  it('a tilapia mantem os dois custos, em produtos separados', () => {
    const porcao = plano.desdobrar.find((d) => d.baseNome === 'FILÉ DE TILÁPIA')
    expect(porcao).toMatchObject({
      nome: 'FILÉ DE TILÁPIA (PORCIONADO)',
      unidade: 'UND',
      custo: 6.34,
      destino: 'Cozinha',
    })
  })

  it('o produto repetido no MESMO setor nao vira desdobramento', () => {
    // POLIFLOR aparece duas vezes no Estoque Geral, com custo e quantidade
    // zero — a segunda e linha repetida da planilha, e o seed ja ficou com a
    // primeira. Ressuscita-la aqui criaria um produto fantasma no catalogo.
    expect(plano.desdobrar.some((d) => d.baseNome === 'POLIFLOR')).toBe(false)
  })

  it('nenhum nome novo colide com produto que ja existe', () => {
    const existentes = new Set(dados.produtos.map((p) => p.nome))
    for (const d of plano.desdobrar) expect(existentes.has(d.nome)).toBe(false)
  })

  it('os nomes novos nao colidem entre si', () => {
    const novos = plano.desdobrar.map((d) => d.nome)
    expect(new Set(novos).size).toBe(novos.length)
  })

  it('todo desdobramento sai de um setor que vai deixar de existir', () => {
    for (const d of plano.desdobrar) {
      expect(ARQUIVADOS.concat(RENOMEADO.de)).toContain(d.setorDeOrigem)
    }
  })
})

describe('o SQL gerado', () => {
  it('nao toca em contagem_itens: a foto de agosto e imutavel', () => {
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+contagem_itens/i)
  })

  it('nao apaga setor nenhum — arquiva', () => {
    expect(sql).not.toMatch(/delete\s+from\s+setores/i)
    expect(sql).toMatch(/update setores set ativo = false/)
  })

  it('nao mexe nas categorias', () => {
    expect(sql).not.toMatch(/\b(update|delete from)\s+categorias/i)
    expect(sql).not.toMatch(/insert into categorias/i)
  })

  it('renomeia o Estoque Geral em vez de criar uma Cozinha nova', () => {
    expect(sql).toMatch(new RegExp(`update setores set nome = '${RENOMEADO.para}'`))
    expect(sql).not.toMatch(/insert into setores[^;]*'Cozinha'/)
  })

  it('cria as duas areas novas, e so elas', () => {
    const bloco = sql.slice(sql.indexOf('insert into setores'))
    expect(bloco).toContain("'Limpeza'")
    expect(bloco).toContain("'Descartáveis'")
    expect(bloco.slice(0, bloco.indexOf(';'))).not.toContain("'Bar'")
  })

  it('roda dentro de uma transacao', () => {
    // A primeira linha que nao e comentario nem vazia tem de ser o begin: um
    // arquivo que muda 868 vinculos nao pode parar no meio e deixar metade.
    const primeira = sql
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '' && !l.startsWith('--'))
    expect(primeira).toBe('begin;')
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('se recusa a terminar se a conta nao fechar', () => {
    expect(sql).toContain('esperava 868 vinculos')
    expect(sql).toContain(`esperava ${SETORES_FINAIS.length} setores ativos`)
  })

  it('diz por extenso qual categoria vai para qual area', () => {
    // O update casa por uuid de categoria. Sem o nome ao lado, quem le o
    // arquivo nao tem como saber que aquelas 75 linhas sao a limpeza.
    for (const [categoria, setor] of Object.entries(POR_CATEGORIA)) {
      expect(sql).toContain(`-- categoria ${categoria} -> setor ${setor}`)
    }
  })
})
