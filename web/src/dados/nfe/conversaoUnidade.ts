/**
 * Conversão da unidade comercial da nota para a unidade do cadastro.
 *
 * O fornecedor fatura como vende: caixa, fardo, dúzia, quilo. O estoque conta
 * como usa: unidade, grama, mililitro. O `fator_conversao` de `nota_itens` é a
 * ponte — quantidade × fator = quantidade na unidade do cadastro.
 *
 * Regra de ouro: na dúvida, fator 1 + aviso. Chutar 12 onde eram 6 estraga o
 * custo médio do produto e, na sequência, o CMV do mês inteiro.
 */

// -------------------------------------------------------------- tipos -----

export type FamiliaUnidade = 'massa' | 'volume' | 'unidade'

export interface MedidaConhecida {
  familia: FamiliaUnidade
  /** Quanto vale 1 desta unidade na base da família (KG, L ou UN). */
  emBase: number
}

export interface ConteudoEmbalagem {
  valor: number
  /** Unidade do conteúdo, já normalizada (ML, L, G, KG…). */
  unidade: string
}

export interface Embalagem {
  /** Quantas peças vêm no volume faturado (o 24 de "CX C/24"). */
  multiplicador: number
  /** Conteúdo de cada peça, quando a descrição informa ("12X1L" → 1 L). */
  conteudo: ConteudoEmbalagem | null
  /** Trecho da descrição que gerou o palpite — a UI mostra para o humano conferir. */
  trecho: string
}

export interface EntradaConversao {
  /** `uCom` da nota: CX, FD, KG, UN… */
  unidadeComercial: string
  /** Descrição do item na nota; é dela que sai o "C/24". */
  descricao?: string
  /** `produtos.unidade` do produto casado. Sem ele, assume-se a unidade avulsa. */
  unidadeCadastro?: string | null
}

export type OrigemFator = 'identidade' | 'tabela' | 'descricao' | 'desconhecida'

export interface ResultadoConversao {
  /** Multiplicador para `nota_itens.fator_conversao` (sempre > 0). */
  fator: number
  origem: OrigemFator
  /** Embalagem detectada na descrição, quando houve. */
  embalagem: Embalagem | null
  /** Texto em português quando o fator é um palpite ou não foi possível converter. */
  aviso: string | null
}

// ------------------------------------------------------------- tabelas ----

/** Unidades de medida que o sistema sabe converter entre si. */
const MEDIDAS: Record<string, MedidaConhecida> = {
  // massa (base: KG)
  KG: { familia: 'massa', emBase: 1 },
  KGS: { familia: 'massa', emBase: 1 },
  QUILO: { familia: 'massa', emBase: 1 },
  G: { familia: 'massa', emBase: 0.001 },
  GR: { familia: 'massa', emBase: 0.001 },
  GRS: { familia: 'massa', emBase: 0.001 },
  GRAMA: { familia: 'massa', emBase: 0.001 },
  MG: { familia: 'massa', emBase: 0.000001 },
  TON: { familia: 'massa', emBase: 1000 },
  T: { familia: 'massa', emBase: 1000 },

  // volume (base: L)
  L: { familia: 'volume', emBase: 1 },
  LT: { familia: 'volume', emBase: 1 },
  LTR: { familia: 'volume', emBase: 1 },
  LTS: { familia: 'volume', emBase: 1 },
  LITRO: { familia: 'volume', emBase: 1 },
  ML: { familia: 'volume', emBase: 0.001 },
  CL: { familia: 'volume', emBase: 0.01 },
  M3: { familia: 'volume', emBase: 1000 },

  // contagem (base: UN)
  UN: { familia: 'unidade', emBase: 1 },
  UND: { familia: 'unidade', emBase: 1 },
  UNID: { familia: 'unidade', emBase: 1 },
  UNIDADE: { familia: 'unidade', emBase: 1 },
  PC: { familia: 'unidade', emBase: 1 },
  PEC: { familia: 'unidade', emBase: 1 },
  PECA: { familia: 'unidade', emBase: 1 },
  PCS: { familia: 'unidade', emBase: 1 },
  DZ: { familia: 'unidade', emBase: 12 },
  DUZIA: { familia: 'unidade', emBase: 12 },
  DZIA: { familia: 'unidade', emBase: 12 },
}

/** Unidades que são embalagem: só a descrição diz quanto cabe dentro. */
const EMBALAGENS: Record<string, string> = {
  CX: 'caixa',
  CXA: 'caixa',
  CAIXA: 'caixa',
  FD: 'fardo',
  FARDO: 'fardo',
  PCT: 'pacote',
  PACOTE: 'pacote',
  SC: 'saco',
  SACO: 'saco',
  SACA: 'saca',
  BD: 'balde',
  BALDE: 'balde',
  BJ: 'bandeja',
  BDJ: 'bandeja',
  BANDEJA: 'bandeja',
  ENG: 'engradado',
  GRD: 'engradado',
  RL: 'rolo',
  TB: 'tubo',
}

/**
 * Normalização leve: tira acento e caixa, mas **mantém** pontuação. O separador
 * importa aqui — `chaveBusca()` transformaria "1,5L" em "1 5L" e o parser de
 * embalagem perderia o decimal.
 */
function normalizarDescricao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Unidade vira sigla comparável: "cx." → "CX", "Und" → "UND". */
export function normalizarUnidade(unidade: string | null | undefined): string {
  if (!unidade) return ''
  return unidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function paraNumero(bruto: string): number {
  return Number(bruto.replace(',', '.'))
}

function arredondar(valor: number): number {
  // `fator_conversao` é numeric(14,6) — mais casas do que isso o banco corta.
  return Math.round(valor * 1_000_000) / 1_000_000
}

// -------------------------------------------- leitura da descrição --------

const PADRAO_PACK_COM_CONTEUDO =
  /(\d{1,4})\s*[X*]\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(ML|L|LT|LTS|LITROS?|KG|KGS|G|GR|GRS|GRAMAS?|MG|UN|UND|UNID)\b/
const PADRAO_COM_BARRA = /\bC\s*[\/.]?\s*(\d{1,4})\b/
const PADRAO_COM_PALAVRA = /\bCOM\s*(\d{1,4})\b/
const PADRAO_QTD_UNIDADES = /\b(\d{1,4})\s*(?:UN|UND|UNID|UNIDADES?|PECAS?|PC|PCS)\b/
const PADRAO_MULTIPLICADOR = /\b(\d{1,4})\s*[X*](?![A-Z0-9])/
const PADRAO_CONTEUDO = /(\d{1,5}(?:[.,]\d{1,3})?)\s*(ML|L|LT|LTS|LITROS?|KG|KGS|G|GR|GRS|GRAMAS?|MG)\b/

/**
 * Descobre embalagem e conteúdo na descrição do item.
 *
 * Exemplos reais de nota de bebida e mercearia:
 * "CERVEJA HEINEKEN CX C/24" → 24 peças
 * "REFRIGERANTE CX 12X1L"    → 12 peças de 1 L
 * "AGUA MINERAL 12X500ML"    → 12 peças de 500 ML
 * "ACUCAR PCT C/ 100"        → 100 peças
 */
export function extrairEmbalagem(descricao: string | null | undefined): Embalagem | null {
  if (!descricao) return null
  const texto = normalizarDescricao(descricao)

  const comConteudo = PADRAO_PACK_COM_CONTEUDO.exec(texto)
  if (comConteudo) {
    const multiplicador = Number(comConteudo[1])
    const valor = paraNumero(comConteudo[2] ?? '')
    const unidade = normalizarUnidade(comConteudo[3])
    if (multiplicador > 0 && valor > 0) {
      return {
        multiplicador,
        conteudo: { valor, unidade },
        trecho: comConteudo[0],
      }
    }
  }

  const somenteMultiplicador =
    PADRAO_COM_BARRA.exec(texto) ??
    PADRAO_COM_PALAVRA.exec(texto) ??
    PADRAO_QTD_UNIDADES.exec(texto) ??
    PADRAO_MULTIPLICADOR.exec(texto)

  if (somenteMultiplicador) {
    const multiplicador = Number(somenteMultiplicador[1])
    if (multiplicador > 0) {
      const conteudo = PADRAO_CONTEUDO.exec(texto)
      return {
        multiplicador,
        conteudo: conteudo
          ? { valor: paraNumero(conteudo[1] ?? ''), unidade: normalizarUnidade(conteudo[2]) }
          : null,
        trecho: somenteMultiplicador[0].trim(),
      }
    }
  }

  // Sem multiplicador, mas com conteúdo declarado: "OLEO DE SOJA 900ML".
  const soConteudo = PADRAO_CONTEUDO.exec(texto)
  if (soConteudo) {
    const valor = paraNumero(soConteudo[1] ?? '')
    if (valor > 0) {
      return {
        multiplicador: 1,
        conteudo: { valor, unidade: normalizarUnidade(soConteudo[2]) },
        trecho: soConteudo[0].trim(),
      }
    }
  }

  return null
}

/** Fator entre duas unidades da mesma família; null quando são incompatíveis. */
export function fatorEntreUnidades(de: string, para: string): number | null {
  const origem = MEDIDAS[normalizarUnidade(de)]
  const destino = MEDIDAS[normalizarUnidade(para)]
  if (!origem || !destino) return null
  if (origem.familia !== destino.familia) return null
  return arredondar(origem.emBase / destino.emBase)
}

// ------------------------------------------------------------ conversão ---

/**
 * Devolve o `fator_conversao` para o item da nota.
 *
 * Sem unidade de cadastro (item ainda não casado com produto) a conversão se
 * limita ao que a própria nota diz: dúzia vira 12, caixa vira o que estiver na
 * descrição, medida continua medida.
 */
export function converterUnidade(entrada: EntradaConversao): ResultadoConversao {
  const unidadeNota = normalizarUnidade(entrada.unidadeComercial)
  const unidadeCadastro = normalizarUnidade(entrada.unidadeCadastro)
  const destino = unidadeCadastro ? MEDIDAS[unidadeCadastro] : undefined
  const embalagem = extrairEmbalagem(entrada.descricao)

  if (unidadeNota === '') {
    return {
      fator: 1,
      origem: 'desconhecida',
      embalagem,
      aviso: 'O item não informa unidade comercial: fator 1 aplicado, confira antes de lançar.',
    }
  }

  // Mesma sigla dos dois lados: não há o que converter.
  if (unidadeCadastro !== '' && unidadeNota === unidadeCadastro) {
    return { fator: 1, origem: 'identidade', embalagem, aviso: null }
  }

  const nomeEmbalagem = EMBALAGENS[unidadeNota]
  if (nomeEmbalagem) {
    if (!embalagem) {
      return {
        fator: 1,
        origem: 'desconhecida',
        embalagem: null,
        aviso:
          `Não dá para saber quantas unidades vêm em 1 ${nomeEmbalagem} (${entrada.unidadeComercial}): ` +
          'fator 1 aplicado. Informe o fator à mão.',
      }
    }

    // Caixa de bebida com volume declarado e cadastro em litro/ml: converte tudo.
    if (embalagem.conteudo && destino && destino.familia !== 'unidade') {
      const conversao = fatorEntreUnidades(embalagem.conteudo.unidade, unidadeCadastro)
      if (conversao !== null) {
        return {
          fator: arredondar(embalagem.multiplicador * embalagem.conteudo.valor * conversao),
          origem: 'descricao',
          embalagem,
          aviso: null,
        }
      }
    }

    const aviso =
      destino && destino.familia !== 'unidade'
        ? `A descrição diz ${embalagem.multiplicador} por ${nomeEmbalagem}, mas não o conteúdo de cada um; ` +
          `o cadastro está em ${unidadeCadastro}. Confira o fator.`
        : null

    return {
      fator: arredondar(embalagem.multiplicador),
      origem: 'descricao',
      embalagem,
      aviso,
    }
  }

  const origemMedida = MEDIDAS[unidadeNota]
  if (!origemMedida) {
    return {
      fator: 1,
      origem: 'desconhecida',
      embalagem,
      aviso: `Unidade "${entrada.unidadeComercial}" desconhecida: fator 1 aplicado, confira antes de lançar.`,
    }
  }

  if (!destino) {
    // Sem cadastro para comparar: só a dúzia (e parentes) já tem fator próprio.
    return {
      fator: arredondar(origemMedida.familia === 'unidade' ? origemMedida.emBase : 1),
      origem: origemMedida.emBase === 1 ? 'identidade' : 'tabela',
      embalagem,
      aviso:
        unidadeCadastro === ''
          ? null
          : `Unidade de cadastro "${entrada.unidadeCadastro}" desconhecida: fator 1 aplicado.`,
    }
  }

  if (origemMedida.familia === destino.familia) {
    return {
      fator: arredondar(origemMedida.emBase / destino.emBase),
      origem: 'tabela',
      embalagem,
      aviso: null,
    }
  }

  // Nota em peça, cadastro em medida: a descrição pode salvar ("LEITE 1L", UN → L).
  if (origemMedida.familia === 'unidade' && embalagem?.conteudo) {
    const conversao = fatorEntreUnidades(embalagem.conteudo.unidade, unidadeCadastro)
    if (conversao !== null) {
      return {
        fator: arredondar(origemMedida.emBase * embalagem.multiplicador * embalagem.conteudo.valor * conversao),
        origem: 'descricao',
        embalagem,
        aviso: null,
      }
    }
  }

  return {
    fator: 1,
    origem: 'desconhecida',
    embalagem,
    aviso:
      `A nota veio em ${unidadeNota} e o cadastro está em ${unidadeCadastro}: ` +
      'são grandezas diferentes, então o fator 1 é só um palpite. Ajuste à mão.',
  }
}
