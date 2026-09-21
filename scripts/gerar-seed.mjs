// ============================================================================
// Multiverso · gerador do seed do primeiro restaurante
// ----------------------------------------------------------------------------
// Le dados/contagem-bar-do-zeca-2026-08.json (planilha ja extraida e conferida)
// e escreve supabase/seed/0001_bar_do_zeca.sql.
//
// Por que gerar em vez de escrever o SQL a mao: sao ~2.600 linhas de INSERT
// derivadas de um JSON que ainda pode ser reextraido da planilha. Gerando,
// qualquer correcao na origem vira SQL novo sem trabalho manual — e sem o risco
// de alguem corrigir o SQL e esquecer o JSON (ou o contrario).
//
// Os identificadores sao UUIDv5 derivados do nome, e nao gen_random_uuid():
// rodar o gerador duas vezes produz exatamente o mesmo arquivo, e reaplicar o
// SQL cai sempre na mesma linha (on conflict (id)). Sem isso, a idempotencia
// dependeria de inferir indices sobre expressoes (lower(mv_sem_acento(nome))),
// que e bem mais fragil de escrever e de ler.
// ============================================================================

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const ORIGEM_JSON = resolve(RAIZ, 'dados/contagem-bar-do-zeca-2026-08.json')
export const DESTINO_SQL = resolve(RAIZ, 'supabase/seed/0001_bar_do_zeca.sql')

// UUID fixo e literal do tenant. Escolhido a mao (os digitos hex do primeiro
// grupo, "b0a12eca", se leem como "bar do zeca") para o time reconhecer o
// restaurante de olho em qualquer log, e para o front conseguir apontar para
// ele em desenvolvimento sem ter de consultar o banco antes.
export const RESTAURANTE_ID = 'b0a12eca-0000-4000-8000-000000000001'

// Total fechado da planilha de agosto/2026. E a unica constante "de negocio"
// deste arquivo: todo o resto e derivado do JSON de origem.
export const TOTAL_ESPERADO = 78681.3573

export const REFERENCIA = '2026-08-31'
export const TIPO_CONTAGEM = 'mensal'

// Separador usado so para montar chaves de deduplicacao em memoria. Uma barra
// vertical dupla nao aparece em nome de produto nem de setor da planilha.
const SEP = '||'

// --------------------------------------------------------------- utilidades -

/** UUIDv5 (RFC 4122): mesmo nome, mesmo id, sempre. */
function uuid5(espacoDeNomes, nome) {
  const ns = Buffer.from(espacoDeNomes.replaceAll('-', ''), 'hex')
  const h = createHash('sha1').update(ns).update(Buffer.from(nome, 'utf8')).digest()
  const b = Buffer.from(h.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50 // versao 5
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const s = b.toString('hex')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

const idDe = (tipo, chave) => uuid5(RESTAURANTE_ID, `${tipo}:${chave}`)

/** Literal de texto SQL. A planilha tem nomes como GIN GORDON'S LONDO DRY. */
export function txt(valor) {
  if (valor === null || valor === undefined) return 'null'
  return `'${String(valor).replaceAll("'", "''")}'`
}

/**
 * Literal numerico sem notacao cientifica: 0.000001 nao pode sair como 1e-6,
 * que o Postgres ate aceita mas que ninguem confere lendo o arquivo.
 */
export function num(valor, casas) {
  const n = Number(valor)
  if (!Number.isFinite(n)) throw new Error(`valor numerico invalido: ${valor}`)
  if (n < 0) throw new Error(`valor negativo nao cabe no schema: ${valor}`)
  let s = n.toFixed(casas)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

// ------------------------------------------------------------------- cores --

const hexParaRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function luminancia(hex) {
  const [r, g, b] = hexParaRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razao de contraste da WCAG. AA para texto pede 4.5:1. */
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function hslParaHex(h, s, l) {
  const sat = s / 100
  const luz = l / 100
  const k = (n) => (n + h / 30) % 12
  const a = sat * Math.min(luz, 1 - luz)
  const f = (n) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

// Matiz nao tem luminancia uniforme: amarelo e verde-limao nascem claros, azul
// e violeta nascem escuros. Sem compensar, a mesma luz nominal produz chips que
// reprovam em contraste de um lado e berram do outro — e o lado que reprova
// depende do tema.
//
//   fundo escuro -> o chip e claro, e o risco e o AZUL sumir. Ele sobe.
//   fundo claro  -> o chip e escuro, e o risco e o AMARELO sumir. Ele desce.
const compensacao = (h, claro) =>
  claro
    ? h >= 40 && h < 200
      ? -10 // amarelo, lima e verde: escurecem para aparecer no branco
      : h >= 200 && h <= 300
        ? 4 // azul e violeta ja sao escuros; forcar mais vira borrao
        : 0
    : h >= 200 && h <= 300
      ? 10
      : h >= 300 || h < 40
        ? 2
        : 0

// Verde-garrafa sobre branco, a mesma direcao da plataforma. O acento ambar e a
// cerveja no balcao — e o unico lugar onde a cor levanta a voz.
//
// O admin troca tudo isto na tela de Identidade visual: esta marca e o ponto de
// partida do cliente, nao uma sentenca.
export const MARCA = {
  cor_primaria: '#12543D',
  cor_secundaria: '#0A3226',
  cor_acento: '#A35A12',
  cor_fundo: '#F0F5F2',
  cor_superficie: '#FFFFFF',
  cor_texto: '#10201A',
  fonte_titulo: 'Archivo',
  fonte_texto: 'Inter',
  raio_borda: '14px',
  tema: 'claro',
}

/**
 * As cores de categoria e de setor saem de uma varredura de matiz com
 * saturacao e luminosidade presas a faixas estreitas. E o que faz a paleta
 * parecer uma familia em vez de 27 cores sorteadas — e o que garante o
 * contraste minimo, ja que a luz de cada cor nunca escapa da faixa.
 */
function paleta(quantidade, { saturacaoBase, luzBase }) {
  const claro = MARCA.tema === 'claro'
  const cores = []
  for (let i = 0; i < quantidade; i += 1) {
    const h = (38 + i * (360 / quantidade)) % 360
    const s = saturacaoBase + (i % 3) * 6
    const l = luzBase + (i % 2) * (claro ? -4 : 4) + compensacao(h, claro)
    cores.push(hslParaHex(h, s, l))
  }
  return cores
}

/** A faixa de luz muda de lado conforme o tema: chip claro sobre fundo escuro,
 *  chip escuro sobre fundo claro. A saturacao fica onde esta — e ela que faz as
 *  27 cores parecerem uma familia. */
const FAIXA = MARCA.tema === 'claro'
  ? { categorias: { saturacaoBase: 62, luzBase: 34 }, setores: { saturacaoBase: 46, luzBase: 36 } }
  : { categorias: { saturacaoBase: 58, luzBase: 64 }, setores: { saturacaoBase: 44, luzBase: 70 } }

function conferirContraste(cores, rotulo) {
  for (const cor of cores) {
    const noFundo = contraste(cor, MARCA.cor_fundo)
    const naSuperficie = contraste(cor, MARCA.cor_superficie)
    if (noFundo < 4.5 || naSuperficie < 4.5) {
      throw new Error(
        `${rotulo}: ${cor} reprova em AA (fundo ${noFundo.toFixed(2)}, superficie ${naSuperficie.toFixed(2)})`,
      )
    }
  }
}

// ------------------------------------------------------------- modelo/dados -

/** Transforma o JSON da planilha nas linhas que o SQL vai receber. */
export function montarModelo(dados) {
  // Pares produto x setor que a planilha repete. Cada um e anotado duas vezes
  // (no cadastro e na contagem); a chave junta as duas metades para o relatorio
  // sair com uma linha por par, e nao duas.
  const repetidos = new Map()
  const anotaRepetido = (produto, setor, campos) => {
    const chave = produto + SEP + setor
    repetidos.set(chave, { produto, setor, ...(repetidos.get(chave) ?? {}), ...campos })
  }

  const setores = dados.setores.map((nome, i) => ({ id: idDe('setor', nome), nome, ordem: i + 1 }))
  const ordemDoSetor = new Map(setores.map((s) => [s.nome, s.ordem]))

  const categorias = dados.categorias.map((nome, i) => ({ id: idDe('categoria', nome), nome, ordem: i + 1 }))
  const idDaCategoria = new Map(categorias.map((c) => [c.nome, c.id]))

  const coresCategorias = paleta(categorias.length, FAIXA.categorias)
  // Os setores ficam numa faixa deslocada e menos saturada de proposito: na
  // tela eles aparecem lado a lado com as categorias e precisam se distinguir.
  const coresSetores = paleta(setores.length, FAIXA.setores)
  conferirContraste(coresCategorias, 'categorias')
  conferirContraste(coresSetores, 'setores')
  categorias.forEach((c, i) => { c.cor = coresCategorias[i] })
  setores.forEach((s, i) => { s.cor = coresSetores[i] })

  const produtos = []
  const vinculos = []
  const paresVistos = new Set()

  for (const p of dados.produtos) {
    const categoriaId = idDaCategoria.get(p.categoria)
    if (!categoriaId) throw new Error(`produto ${p.nome}: categoria desconhecida ${p.categoria}`)

    for (const s of p.setores) {
      if (!ordemDoSetor.has(s.setor)) throw new Error(`produto ${p.nome}: setor desconhecido ${s.setor}`)
    }

    // Ordena por setor para que o "principal" seja sempre o de menor ordem.
    // sort() e estavel, entao entre dois registros do MESMO setor continua
    // valendo a ordem em que a planilha os trouxe.
    const ordenados = [...p.setores].sort((a, b) => ordemDoSetor.get(a.setor) - ordemDoSetor.get(b.setor))

    const porSetor = []
    for (const s of ordenados) {
      const chave = p.nome + SEP + s.setor
      if (paresVistos.has(chave)) {
        // A planilha repete o mesmo par produto x setor em blocos diferentes da
        // mesma aba (o item aparece em duas secoes). O schema so admite um
        // vinculo por par — primary key (produto_id, setor_id) — entao fica o
        // primeiro, que e a linha de cima na planilha.
        anotaRepetido(p.nome, s.setor, { custoDescartado: s.custo })
        continue
      }
      paresVistos.add(chave)
      porSetor.push(s)
    }

    const principal = porSetor[0]
    if (!principal) throw new Error(`produto ${p.nome}: ficou sem nenhum setor`)

    const produtoId = idDe('produto', p.nome)
    produtos.push({
      id: produtoId,
      nome: p.nome,
      categoriaId,
      // unidade e custo_medio sao os do setor de menor ordem. O mesmo item pode
      // valer R$ 41,50/KG cru no Estoque Geral e R$ 6,34/porcao nos Porcionados;
      // o cadastro guarda o custo de onde a mercadoria entra na casa, e cada
      // setor mantem o proprio numero no vinculo.
      unidade: principal.unidade,
      custoMedio: principal.custo,
    })

    for (const s of porSetor) {
      vinculos.push({
        produtoId,
        produtoNome: p.nome,
        setorId: idDe('setor', s.setor),
        setorNome: s.setor,
        unidade: s.unidade,
        custo: s.custo,
        ordem: ordemDoSetor.get(s.setor),
      })
    }
  }

  const idDoProduto = new Map(produtos.map((p) => [p.nome, p.id]))

  const itens = []
  const itensVistos = new Set()
  for (const l of dados.linhas) {
    const produtoId = idDoProduto.get(l.produto)
    if (!produtoId) throw new Error(`linha ${l.origem}: produto ${l.produto} nao esta no cadastro`)
    const chave = l.produto + SEP + l.setor
    if (itensVistos.has(chave)) {
      anotaRepetido(l.produto, l.setor, { origem: l.origem, quantidadeDescartada: l.quantidade })
      continue
    }
    itensVistos.add(chave)
    itens.push({
      produtoId,
      produtoNome: l.produto,
      setorId: idDe('setor', l.setor),
      setorNome: l.setor,
      quantidade: l.quantidade,
      unidade: l.unidade,
      custo: l.custo_unitario,
      origem: l.origem,
    })
  }

  // Invariante: a folha de contagem e exatamente o cadastro de produto x setor.
  // Se as duas listas divergirem, a extracao da planilha esta inconsistente e
  // nao adianta gerar SQL bonito em cima de dado torto.
  const paresVinculo = new Set(vinculos.map((v) => v.produtoNome + SEP + v.setorNome))
  for (const i of itens) {
    if (!paresVinculo.has(i.produtoNome + SEP + i.setorNome)) {
      throw new Error(`item ${i.produtoNome} / ${i.setorNome} nao tem vinculo em produto_setores`)
    }
  }
  if (paresVinculo.size !== itens.length) {
    throw new Error(`vinculos (${paresVinculo.size}) e itens (${itens.length}) nao batem`)
  }

  // Soma como o banco vai somar: cada linha arredondada em 4 casas (a coluna
  // gerada contagem_itens.total), e so depois o acumulado.
  const soma = itens.reduce((acc, i) => acc + Math.round(i.quantidade * i.custo * 1e4) / 1e4, 0)
  const total = Math.round(soma * 1e4) / 1e4
  if (Math.abs(total - TOTAL_ESPERADO) > 0.01) {
    throw new Error(`total calculado ${total} difere do esperado ${TOTAL_ESPERADO}`)
  }

  const avisos = [...repetidos.values()].map(
    (r) => `${r.produto} / ${r.setor}: 2a ocorrencia em ${r.origem} descartada `
      + `(custo ${r.custoDescartado}, quantidade ${r.quantidadeDescartada})`,
  )

  return {
    setores,
    categorias,
    produtos,
    vinculos,
    itens,
    avisos,
    total,
    itensContados: itens.filter((i) => i.quantidade > 0).length,
    linhasNaPlanilha: dados.linhas.length,
    contagemId: idDe('contagem', `${TIPO_CONTAGEM}:${REFERENCIA}`),
  }
}

// ----------------------------------------------------------------- escrita --

/** Quebra os VALUES em lotes para o arquivo continuar legivel e diffavel. */
function emLotes(linhas, tamanho = 200) {
  const lotes = []
  for (let i = 0; i < linhas.length; i += tamanho) lotes.push(linhas.slice(i, i + tamanho))
  return lotes
}

// Os marcadores @bloco/@fim nao sao enfeite: scripts/conferir-seed.mjs le o SQL
// por eles para checar o arquivo sem precisar de banco.
function bloco(nome, tabela, colunas, linhas, conflito) {
  const partes = [`-- @bloco:${nome}`]
  for (const lote of emLotes(linhas)) {
    partes.push(`insert into ${tabela} (${colunas.join(', ')}) values`)
    partes.push(lote.map((l) => `  (${l})`).join(',\n'))
    partes.push(conflito + ';')
    partes.push('')
  }
  partes.push(`-- @fim:${nome}`)
  return partes.join('\n')
}

export function gerarSql(modelo, dados) {
  const R = txt(RESTAURANTE_ID)
  const C = txt(modelo.contagemId)
  const descartadas = modelo.linhasNaPlanilha - modelo.itens.length
  const p = []

  p.push(`-- ============================================================================
-- Multiverso · seed 0001 · Bar do Zeca — Norte Shopping
-- ----------------------------------------------------------------------------
-- ARQUIVO GERADO por scripts/gerar-seed.mjs. Nao edite a mao: corrija o JSON de
-- origem ou o gerador e rode \`npm run seed:gerar\` de novo.
--
-- Origem      : ${dados.origem ?? 'planilha de contagem do cliente'}
--               extraida e conferida em dados/contagem-bar-do-zeca-2026-08.json
-- Cliente     : ${dados.restaurante}
-- Competencia : ${dados.competencia} — contagem mensal com referencia ${REFERENCIA}
-- Total esperado da contagem: ${TOTAL_ESPERADO.toFixed(4)}
--
-- O que este arquivo carrega:
--   ${String(modelo.categorias.length).padStart(3)} categorias
--   ${String(modelo.setores.length).padStart(3)} setores
--   ${String(modelo.produtos.length).padStart(3)} produtos
--   ${String(modelo.vinculos.length).padStart(3)} vinculos produto x setor
--   ${String(modelo.itens.length).padStart(3)} itens de contagem (${modelo.itensContados} com quantidade maior que zero)
--
-- DIVERGENCIA CONHECIDA DA PLANILHA
-- A planilha traz ${modelo.linhasNaPlanilha} linhas, mas ${descartadas} delas repetem um par produto x setor
-- que ja aparecera antes (o mesmo item listado em dois blocos da mesma aba). O
-- schema so admite um vinculo por par — primary key (produto_id, setor_id) e
-- unique (contagem_id, produto_id, setor_id) — entao vale a primeira ocorrencia
-- e a carga fica com ${modelo.vinculos.length} vinculos e ${modelo.itens.length} itens. As ${descartadas} linhas descartadas
-- estao com quantidade zero, logo o total da contagem nao muda:
${modelo.avisos.map((a) => `--   · ${a}`).join('\n')}
--
-- IDEMPOTENCIA
-- Todos os ids sao UUIDv5 derivados do nome e todo insert tem \`on conflict\`
-- apoiado em chave primaria ou indice unico. Aplicar duas vezes atualiza as
-- mesmas linhas em vez de duplicar.
--
-- Como aplicar: veja supabase/seed/README.md.
-- ============================================================================

begin;
`)

  // ----------------------------------------------------------- restaurante --
  p.push(`-- @bloco:restaurante
-- Identidade de boteco moderno: madeira escura no fundo, ambar de chope na
-- primaria, verde de garrafa na secundaria, vermelho de toldo no acento. As
-- tres cores de marca e o texto passam de 4.5:1 (AA) sobre o fundo e sobre a
-- superficie — conferido pelo gerador, que se recusa a escrever cor reprovada.
insert into restaurantes (
  id, nome, slug, unidade, ativo,
  cor_primaria, cor_secundaria, cor_acento,
  cor_fundo, cor_superficie, cor_texto,
  fonte_titulo, fonte_texto, raio_borda, tema
) values (
  ${R}, ${txt(dados.restaurante)}, ${txt('bar-do-zeca-norte-shopping')}, ${txt('Norte Shopping')}, true,
  ${txt(MARCA.cor_primaria)}, ${txt(MARCA.cor_secundaria)}, ${txt(MARCA.cor_acento)},
  ${txt(MARCA.cor_fundo)}, ${txt(MARCA.cor_superficie)}, ${txt(MARCA.cor_texto)},
  ${txt(MARCA.fonte_titulo)}, ${txt(MARCA.fonte_texto)}, ${txt(MARCA.raio_borda)}, ${txt(MARCA.tema)}
)
on conflict (id) do update set
  nome = excluded.nome, slug = excluded.slug, unidade = excluded.unidade, ativo = true,
  cor_primaria = excluded.cor_primaria, cor_secundaria = excluded.cor_secundaria,
  cor_acento = excluded.cor_acento, cor_fundo = excluded.cor_fundo,
  cor_superficie = excluded.cor_superficie, cor_texto = excluded.cor_texto,
  fonte_titulo = excluded.fonte_titulo, fonte_texto = excluded.fonte_texto,
  raio_borda = excluded.raio_borda, tema = excluded.tema;
-- @fim:restaurante
`)

  // ------------------------------------------------------------ categorias --
  p.push(`-- Categorias na ordem da planilha. A cor vem de uma varredura de matiz com
-- saturacao e luz presas a uma faixa estreita, para os chips formarem familia.`)
  p.push(bloco(
    'categorias',
    'categorias',
    ['id', 'restaurante_id', 'nome', 'cor', 'ordem'],
    modelo.categorias.map((c) => [txt(c.id), R, txt(c.nome), txt(c.cor), c.ordem].join(', ')),
    `on conflict (id) do update set
  nome = excluded.nome, cor = excluded.cor, ordem = excluded.ordem, ativo = true`,
  ))
  p.push('')

  // --------------------------------------------------------------- setores --
  p.push(`-- A ordem do setor nao e decorativa: e ela que define o setor "principal" de
-- cada produto (o de menor ordem), de onde saem a unidade e o custo_medio do
-- cadastro. Bar vem primeiro porque e onde a casa fatura.`)
  p.push(bloco(
    'setores',
    'setores',
    ['id', 'restaurante_id', 'nome', 'cor', 'ordem'],
    modelo.setores.map((s) => [txt(s.id), R, txt(s.nome), txt(s.cor), s.ordem].join(', ')),
    `on conflict (id) do update set
  nome = excluded.nome, cor = excluded.cor, ordem = excluded.ordem, ativo = true`,
  ))
  p.push('')

  // -------------------------------------------------------------- produtos --
  p.push(`-- custo_medio e unidade vem do setor de menor ordem. A planilha da o mesmo
-- item com preco diferente por setor (cru no estoque, porcionado na cozinha);
-- o cadastro guarda o valor de onde a mercadoria entra, e o custo de cada setor
-- fica no vinculo logo abaixo — e e ele que a contagem usa.`)
  p.push(bloco(
    'produtos',
    'produtos',
    ['id', 'restaurante_id', 'categoria_id', 'nome', 'unidade', 'custo_medio'],
    modelo.produtos.map((x) => [txt(x.id), R, txt(x.categoriaId), txt(x.nome), txt(x.unidade), num(x.custoMedio, 6)].join(', ')),
    `on conflict (id) do update set
  categoria_id = excluded.categoria_id, nome = excluded.nome,
  unidade = excluded.unidade, custo_medio = excluded.custo_medio, ativo = true`,
  ))
  p.push('')

  // ------------------------------------------------------- produto_setores --
  p.push(`-- O N:N com unidade e custo POR SETOR, coracao do modulo de cadastros.
--
-- custo_fixo marca o vinculo cujo custo NAO e preco de compra. A regra usada
-- aqui: quando o custo do setor difere do custo de referencia do produto, ele
-- foi calculado pela casa — file de tilapia e R$ 41,50/KG no Estoque Geral (o
-- que se paga ao fornecedor) e R$ 6,34 a porcao nos Porcionados (o que a
-- cozinha apurou). Sem essa marca, a primeira nota de tilapia lancada
-- sobrescreveria a porcao com o preco do quilo.
--
-- E um palpite bem-informado sobre a planilha de origem, nao um dado que ela
-- trazia. O admin muda vinculo a vinculo na tela de Produtos.`)
  p.push(bloco(
    'produto_setores',
    'produto_setores',
    ['produto_id', 'setor_id', 'unidade', 'custo', 'ordem', 'custo_fixo'],
    modelo.vinculos.map((v) => {
      const produto = modelo.produtos.find((x) => x.id === v.produtoId)
      const proprio = produto !== undefined && Math.abs(v.custo - produto.custoMedio) > 1e-6
      return [txt(v.produtoId), txt(v.setorId), txt(v.unidade), num(v.custo, 6), v.ordem, proprio]
        .join(', ')
    }),
    `on conflict (produto_id, setor_id) do update set
  unidade = excluded.unidade, custo = excluded.custo, ordem = excluded.ordem,
  custo_fixo = excluded.custo_fixo, ativo = true`,
  ))
  p.push('')

  // -------------------------------------------------------------- contagem --
  p.push(`-- @bloco:contagem
-- A contagem nasce (ou volta a ser) ABERTA de proposito: o trigger
-- t_contagem_itens_bloqueio recusa insert, update e delete de item em contagem
-- fechada. Numa reaplicacao do seed, reabrir aqui e o que permite regravar os
-- itens; o fechamento vem depois deles, no fim do arquivo.
insert into contagens (id, restaurante_id, referencia, tipo, status, titulo, observacao)
values (
  ${C}, ${R}, date ${txt(REFERENCIA)}, ${txt(TIPO_CONTAGEM)}, 'aberta',
  ${txt('Contagem mensal · Agosto/2026 · fechamento de estoque')},
  ${txt(`Carga inicial a partir da planilha do cliente (competencia ${dados.competencia}).`)}
)
on conflict (id) do update set
  referencia = excluded.referencia, tipo = excluded.tipo, titulo = excluded.titulo,
  observacao = excluded.observacao,
  status = 'aberta', fechada_em = null, fechado_por = null,
  total = 0, itens_contados = 0;

-- Sobra de uma carga anterior: item cujo par produto x setor saiu do cadastro.
-- Sem esta limpeza, uma reextracao menor da planilha deixaria linhas orfas
-- inflando o total — e o bloco de verificacao acusaria sem dizer o porque.
delete from contagem_itens i
 where i.contagem_id = ${C}
   and not exists (
     select 1 from produto_setores ps
      where ps.produto_id = i.produto_id and ps.setor_id = i.setor_id);
-- @fim:contagem
`)

  // ------------------------------------------------------ itens da contagem --
  p.push(`-- contagem_itens.total e coluna gerada — round(quantidade * custo_unitario, 4)
-- — por isso nao se escreve total aqui: ele nasce do banco, e e justamente isso
-- que torna a verificacao do fim do arquivo uma conferencia de verdade.`)
  p.push(bloco(
    'contagem_itens',
    'contagem_itens',
    ['contagem_id', 'produto_id', 'setor_id', 'quantidade', 'unidade', 'custo_unitario'],
    modelo.itens.map((i) => [C, txt(i.produtoId), txt(i.setorId), num(i.quantidade, 4), txt(i.unidade), num(i.custo, 6)].join(', ')),
    `on conflict (contagem_id, produto_id, setor_id) do update set
  quantidade = excluded.quantidade, unidade = excluded.unidade,
  custo_unitario = excluded.custo_unitario`,
  ))
  p.push('')

  // ------------------------------------------------------------ fechamento --
  p.push(`-- @bloco:fechamento
-- Fecha SOMANDO o banco, nunca repetindo o numero da planilha: se o que entrou
-- nos itens nao der ${TOTAL_ESPERADO.toFixed(4)}, a verificacao abaixo derruba a transacao.
-- A data de fechamento e a virada do mes contado, e nao now(), para o historico
-- do modulo 2.2 e o CMV lerem agosto como agosto.
update contagens c
   set status = 'fechada',
       fechada_em = ${txt(REFERENCIA + ' 23:59:00-03')}::timestamptz,
       total = (select coalesce(sum(i.total), 0) from contagem_itens i where i.contagem_id = c.id),
       itens_contados = (select count(*) from contagem_itens i
                          where i.contagem_id = c.id and i.quantidade > 0)
 where c.id = ${C};
-- @fim:fechamento
`)

  // ----------------------------------------------------------- verificacao --
  p.push(`-- @bloco:verificacao
-- Rede de seguranca: o seed so vale se bater com a planilha. Qualquer desvio
-- aborta a transacao inteira e nada e aplicado.
do $$
declare
  v_total      numeric;
  v_produtos   integer;
  v_vinculos   integer;
  v_itens      integer;
  v_categorias integer;
  v_setores    integer;
  v_status     text;
begin
  select coalesce(sum(i.total), 0), count(*)
    into v_total, v_itens
    from contagem_itens i
   where i.contagem_id = ${C};

  select count(*) into v_produtos   from produtos   where restaurante_id = ${R};
  select count(*) into v_categorias from categorias where restaurante_id = ${R};
  select count(*) into v_setores    from setores    where restaurante_id = ${R};
  select count(*) into v_vinculos
    from produto_setores ps
    join produtos p on p.id = ps.produto_id
   where p.restaurante_id = ${R};
  select status into v_status from contagens where id = ${C};

  -- Tolerancia de um centavo: a planilha arredonda a exibicao e o banco
  -- arredonda cada linha em 4 casas. Diferenca maior que isso e erro de dado,
  -- nao de arredondamento.
  if abs(v_total - ${TOTAL_ESPERADO.toFixed(4)}) > 0.01 then
    raise exception 'seed: total da contagem e %, esperado ${TOTAL_ESPERADO.toFixed(4)} (diferenca de %)',
      v_total, abs(v_total - ${TOTAL_ESPERADO.toFixed(4)});
  end if;

  if v_produtos <> ${modelo.produtos.length} then
    raise exception 'seed: % produtos cadastrados, esperado ${modelo.produtos.length}', v_produtos;
  end if;

  -- ${modelo.vinculos.length} e nao ${modelo.linhasNaPlanilha}: ver a divergencia explicada no cabecalho
  -- (${descartadas} pares produto x setor repetidos na planilha, todos com quantidade zero).
  if v_vinculos <> ${modelo.vinculos.length} then
    raise exception 'seed: % vinculos produto x setor, esperado ${modelo.vinculos.length}', v_vinculos;
  end if;

  if v_itens <> ${modelo.itens.length} then
    raise exception 'seed: % itens na contagem, esperado ${modelo.itens.length}', v_itens;
  end if;

  if v_categorias <> ${modelo.categorias.length} then
    raise exception 'seed: % categorias, esperado ${modelo.categorias.length}', v_categorias;
  end if;

  if v_setores <> ${modelo.setores.length} then
    raise exception 'seed: % setores, esperado ${modelo.setores.length}', v_setores;
  end if;

  if v_status is distinct from 'fechada' then
    raise exception 'seed: a contagem de ${REFERENCIA} ficou com status %, esperado fechada', v_status;
  end if;

  raise notice 'seed Bar do Zeca ok: % produtos, % vinculos, % itens, total %',
    v_produtos, v_vinculos, v_itens, v_total;
end $$;
-- @fim:verificacao

commit;
`)

  return p.join('\n')
}

// ------------------------------------------------------------------- main --

export function gerar() {
  const dados = JSON.parse(readFileSync(ORIGEM_JSON, 'utf8'))
  const modelo = montarModelo(dados)
  const sql = gerarSql(modelo, dados)
  mkdirSync(dirname(DESTINO_SQL), { recursive: true })
  writeFileSync(DESTINO_SQL, sql, 'utf8')
  return { modelo, sql }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { modelo } = gerar()
  console.log(`seed escrito em ${DESTINO_SQL}`)
  console.log(`  categorias ... ${modelo.categorias.length}`)
  console.log(`  setores ...... ${modelo.setores.length}`)
  console.log(`  produtos ..... ${modelo.produtos.length}`)
  console.log(`  vinculos ..... ${modelo.vinculos.length}`)
  console.log(`  itens ........ ${modelo.itens.length} (${modelo.itensContados} com quantidade > 0)`)
  console.log(`  total ........ ${modelo.total.toFixed(4)}`)
  for (const aviso of modelo.avisos) console.log(`  aviso: ${aviso}`)
}
