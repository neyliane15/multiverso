// ============================================================================
// Multiverso · teste do seed do Bar do Zeca (sem banco)
// ----------------------------------------------------------------------------
// Prova, lendo apenas o SQL gerado e o JSON de origem, que a carga fecha com a
// planilha. E o mesmo contrato do bloco `do $$ ... $$` no fim do seed, so que
// aqui ele roda em CI sem precisar de um Postgres de pe.
// ============================================================================

import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  conferirSeed, linhasDoBloco, paraEscala,
  SQL_PADRAO, JSON_PADRAO, TOTAL_ESPERADO,
} from './conferir-seed.mjs'
import { montarModelo, gerarSql } from './gerar-seed.mjs'

const sql = readFileSync(SQL_PADRAO, 'utf8')
const dados = JSON.parse(readFileSync(JSON_PADRAO, 'utf8'))
const relatorio = conferirSeed()

/** Copia o seed com uma adulteracao, para provar que o conferente morde. */
function seedAdulterado(de, para) {
  const pasta = mkdtempSync(join(tmpdir(), 'mv-seed-'))
  const caminho = join(pasta, 'seed.sql')
  const texto = sql.replace(de, para)
  expect(texto, 'a adulteracao do teste nao encontrou o trecho').not.toBe(sql)
  writeFileSync(caminho, texto, 'utf8')
  return conferirSeed({ sqlPath: caminho, jsonPath: JSON_PADRAO })
}

describe('seed 0001 · Bar do Zeca', () => {
  it('fecha com a planilha em todos os pontos conferidos', () => {
    expect(relatorio.erros).toEqual([])
    expect(relatorio.ok).toBe(true)
  })

  it('soma 78681.3573 nos itens da contagem', () => {
    const escala = 10n ** 4n
    const total = paraEscala(relatorio.resumo.total, 4)
    const esperado = paraEscala(TOTAL_ESPERADO, 4)
    const desvio = total > esperado ? total - esperado : esperado - total
    expect(Number(desvio) / Number(escala)).toBeLessThanOrEqual(0.01)
  })

  it('carrega 854 produtos, 21 categorias e 6 setores', () => {
    expect(relatorio.resumo.produtos).toBe(854)
    expect(relatorio.resumo.categorias).toBe(21)
    expect(relatorio.resumo.setores).toBe(6)
    expect(relatorio.resumo.produtos).toBe(dados.produtos.length)
    expect(relatorio.resumo.categorias).toBe(dados.categorias.length)
    expect(relatorio.resumo.setores).toBe(dados.setores.length)
  })

  it('carrega um vinculo por par produto x setor: 868 dos 869 registros da planilha', () => {
    // A planilha repetia tres pares. Dois deles o cliente resolveu desdobrando
    // em produto proprio (BACON e BARRIGA SUINA da feijoada), entao deixaram de
    // ser repeticao. Sobra POLIFLOR, que e mesmo o mesmo produto listado em duas
    // categorias — e esta zerado, por isso o total nao muda.
    expect(relatorio.resumo.linhasNoJson).toBe(869)
    expect(relatorio.resumo.paresRepetidosNoJson).toBe(1)
    expect(relatorio.resumo.vinculos).toBe(868)
    expect(relatorio.resumo.itens).toBe(868)
  })

  it('desdobra os cortes da feijoada em produtos proprios, com o custo de cada um', () => {
    // A decisao e do cliente: o bacon que vai na feijoada nao e o mesmo dos
    // suinos. Se alguem reverter o desdobramento, um dos dois custos some do
    // cadastro em silencio — e e o custo que vai para o CMV.
    const porNome = new Map(dados.produtos.map((p) => [p.nome, p]))

    for (const [base, desdobrado, custoBase, custoFeijoada] of [
      ['BACON', 'BACON (FEIJOADA)', 25.75, 25.99],
      ['BARRIGA SUÍNA', 'BARRIGA SUÍNA (FEIJOADA)', 21.85, 29.75],
    ]) {
      const original = porNome.get(base)
      const novo = porNome.get(desdobrado)
      expect(original, `${base} sumiu do catalogo`).toBeDefined()
      expect(novo, `${desdobrado} nao foi criado`).toBeDefined()

      const emPorcionados = original.setores.filter((s) => s.setor === 'Porcionados')
      expect(emPorcionados).toHaveLength(1)
      expect(emPorcionados[0].categoria).toBe('SUÍNOS')
      expect(emPorcionados[0].custo).toBe(custoBase)

      expect(novo.setores).toHaveLength(1)
      expect(novo.setores[0].setor).toBe('Porcionados')
      expect(novo.setores[0].categoria).toBe('FEIJOADA')
      expect(novo.setores[0].custo).toBe(custoFeijoada)
    }
  })

  it('preserva os nomes com apostrofo, escapados como o Postgres espera', () => {
    const produtos = linhasDoBloco(sql, 'produtos')
    const nomes = new Set(produtos.map((p) => p.nome))
    const comApostrofo = dados.produtos.map((p) => p.nome).filter((n) => n.includes("'"))

    expect(comApostrofo.length).toBeGreaterThan(0)
    for (const nome of comApostrofo) {
      expect(nomes.has(nome), `nome perdido no SQL: ${nome}`).toBe(true)
      expect(sql).toContain(`'${nome.replaceAll("'", "''")}'`)
    }
    expect(nomes.has("GIN GORDON'S LONDO DRY (750ml)")).toBe(true)
  })

  it('so referencia produtos e setores declarados no proprio arquivo', () => {
    const idsProdutos = new Set(linhasDoBloco(sql, 'produtos').map((p) => p.id))
    const idsSetores = new Set(linhasDoBloco(sql, 'setores').map((s) => s.id))
    const itens = linhasDoBloco(sql, 'contagem_itens')

    expect(itens.length).toBe(868)
    for (const item of itens) {
      expect(idsProdutos.has(item.produto_id), `produto solto na contagem: ${item.produto_id}`).toBe(true)
      expect(idsSetores.has(item.setor_id), `setor solto na contagem: ${item.setor_id}`).toBe(true)
    }
  })

  it('insere os itens antes de fechar a contagem', () => {
    // Ordem invertida = trigger t_contagem_itens_bloqueio derrubando a carga.
    expect(sql.indexOf('-- @bloco:contagem_itens')).toBeLessThan(sql.indexOf('-- @bloco:fechamento'))
    expect(sql.indexOf("status = 'fechada'")).toBeGreaterThan(sql.indexOf('-- @bloco:contagem_itens'))
  })

  it('e idempotente: todo insert tem on conflict', () => {
    const instrucoes = sql.replace(/^\s*--.*$/gm, '') // fora dos comentarios
    const inserts = instrucoes.match(/insert into \w+/g) ?? []
    const conflitos = instrucoes.match(/on conflict/g) ?? []
    expect(inserts.length).toBeGreaterThan(0)
    expect(conflitos.length).toBe(inserts.length)
  })

  it('esta em dia com o gerador e com o JSON de origem', () => {
    // Se alguem editar o SQL a mao ou reextrair a planilha sem regerar, o
    // arquivo versionado deixa de ser o que o gerador produz — e o teste avisa.
    expect(gerarSql(montarModelo(dados), dados)).toBe(sql)
  })
})

describe('a conferencia acusa seed torto', () => {
  it('percebe quantidade adulterada', () => {
    const { ok, erros } = seedAdulterado("16.3, 'KG'", "999.3, 'KG'")
    expect(ok).toBe(false)
    expect(erros.join(' ')).toMatch(/total dos itens/)
  })

  it('percebe aspa solta em nome de produto', () => {
    const { ok, erros } = seedAdulterado("'GIN GORDON''S LONDO DRY (750ml)'", "'GIN GORDON'S LONDO DRY (750ml)'")
    expect(ok).toBe(false)
    expect(erros.length).toBeGreaterThan(0)
  })

  it('percebe item apontando para produto que nao existe', () => {
    const itens = linhasDoBloco(sql, 'contagem_itens')
    const alvo = itens.find((i) => i.produto_id)
    const { ok, erros } = seedAdulterado(
      `'${alvo.produto_id}', '${alvo.setor_id}', ${alvo.quantidade}`,
      `'00000000-0000-4000-8000-000000000000', '${alvo.setor_id}', ${alvo.quantidade}`,
    )
    expect(ok).toBe(false)
    expect(erros.join(' ')).toMatch(/produto fora do cadastro|sem vinculo/)
  })
})
