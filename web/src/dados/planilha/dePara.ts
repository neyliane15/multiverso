/**
 * De-para entre o nome que o PDV (ou o ERP) escreve e o que o sistema conhece.
 *
 * Reusa `casarProdutos.ts` — a cascata de apelido, EAN e código já está lá e já
 * tem teste — e **tranca o último degrau dela**: o degrau da similaridade de
 * texto, que vincula sozinho a partir de 72% de parecença.
 *
 * Por que trancar, medido na planilha de vendas de setembro:
 *
 *     AMSTEL 600 ML          R$ 16.633,21
 *     AMSTEL CHOPP 300 ML
 *     AMSTEL CHOPP 300 ML HH R$  7.023,92
 *
 * São três produtos diferentes. As duas últimas se distinguem por duas letras
 * — "HH" é happy hour, preço de carta diferente, e nenhuma distância de texto
 * separa as duas com segurança. A similaridade marcaria 90%+ entre elas e
 * vincularia a errada sozinha; o estrago sai no CMV e ninguém vê, porque a
 * linha fica parecendo certa.
 *
 * A regra deste arquivo é a mesma que `casarProdutos.ts` já escreveu e que vale
 * dobrado em importação de 136 itens: **linha pendente é incômodo de dois
 * cliques; linha errada é um número falso no dashboard**. Então aqui:
 *
 * - vincula sozinho quando **alguém já disse à mão** que aquele nome é aquele
 *   alvo (apelido aprendido), ou quando o nome é **idêntico** ao do cadastro
 *   depois de normalizado (sem acento, maiúscula, só A-Z0-9);
 * - em todo o resto devolve PENDENTE, com as melhores sugestões para um
 *   clique — nunca com o vínculo feito.
 */
import { casarItem, similaridadeTexto, type ApelidoConhecido, type ProdutoCandidato } from '@/dados/nfe/casarProdutos'
import { fatorEntreUnidades } from '@/dados/nfe/conversaoUnidade'
import { chaveBusca } from '@/util/formato'

/**
 * Limiar impossível de alcançar pela similaridade: `similaridadeTexto` devolve
 * no máximo 1, então `1,01` desliga o degrau 5 sem mexer em `casarProdutos.ts`
 * — os degraus de cima (apelido, EAN, código) continuam valendo inteiros.
 */
const SEM_SIMILARIDADE = 1.01

export type MotivoDoVinculo =
  | 'apelido'
  | 'nome_identico'
  | 'pendente'

export interface SugestaoDeAlvo {
  tipo: 'ficha' | 'produto'
  id: string
  nome: string
  confianca: number
}

// ───────────────────────────────────────────────── compras (nota do ERP) ───

export interface CasamentoDeCompra {
  /** Preenchido só quando dá para vincular sem humano. */
  produtoId: string | null
  motivo: MotivoDoVinculo
  explicacao: string
  fatorSugerido: number | null
}

/**
 * Casa a descrição de uma linha da planilha de compras com um insumo.
 *
 * O apelido aprendido nas notas fiscais vale aqui: é o mesmo vocabulário de
 * fornecedor, e `produto_apelidos` existe exatamente para isso desde a 0004.
 */
export function casarCompraDaPlanilha(
  descricao: string,
  contexto: { produtos: ProdutoCandidato[]; apelidos?: ApelidoConhecido[] },
): CasamentoDeCompra {
  // `casarItem` com o limiar impossível: os degraus de apelido, EAN e código
  // resolvem; o da similaridade nunca vincula. Sem sugestão aqui de propósito —
  // ver `sugerirAlvos`.
  const bruto = casarItem(
    { descricao },
    {
      produtos: contexto.produtos,
      apelidos: contexto.apelidos ?? [],
      confiancaMinima: SEM_SIMILARIDADE,
      // Sem as parecenças de cortesia: elas custam uma comparação de texto por
      // insumo do catálogo, esta função nunca as lê, e eram 628 mil comparações
      // na prévia de 693 linhas — 28 s de interface congelada num telefone.
      semSugestoes: true,
    },
  )

  if (bruto.produtoId !== null) {
    return {
      produtoId: bruto.produtoId,
      motivo: 'apelido',
      explicacao: bruto.explicacao,
      fatorSugerido: bruto.fatorSugerido,
    }
  }

  const identico = porNomeIdentico(descricao, contexto.produtos)
  if (identico) {
    return {
      produtoId: identico.id,
      motivo: 'nome_identico',
      explicacao: `O nome é igual ao do insumo "${identico.nome}" no cadastro.`,
      fatorSugerido: null,
    }
  }

  return {
    produtoId: null,
    motivo: 'pendente',
    explicacao: 'Nenhum vínculo garantido para este nome. Escolha o insumo.',
    fatorSugerido: null,
  }
}

// ───────────────────────────────────────────────────── vendas (nome do PDV) ─

/** O que uma linha de venda pode apontar. Ver a migração 0027. */
export type AlvoDeVenda = 'ficha' | 'produto' | 'servico' | 'pendente'

export interface FichaCandidata {
  id: string
  nome: string
  /** Produção é insumo interno e não se vende: o banco recusa por gatilho. */
  producao: boolean
  ativo: boolean
  preco_venda: number
}

/** Uma linha de `venda_apelidos` — o aprendizado dos vínculos já feitos à mão. */
export interface ApelidoDeVenda {
  apelido: string
  alvo: AlvoDeVenda
  ficha_id: string | null
  produto_id: string | null
}

export interface CasamentoDeVenda {
  alvo: AlvoDeVenda
  fichaId: string | null
  produtoId: string | null
  motivo: MotivoDoVinculo | 'servico_sugerido'
  explicacao: string
  /** Verdadeiro quando o nome tem cara de serviço, para a tela oferecer o atalho. */
  pareceServico: boolean
}

/**
 * Nomes de linha que não consomem insumo nenhum.
 *
 * Couvert artístico e taxa de serviço são **faturamento sem custo de estoque**:
 * R$ 53.049,68 em setembro, 20,8% do que o bar faturou. Eles têm de entrar no
 * faturamento (a cliente pediu os dois lados) e não podem entrar no consumo.
 *
 * E, ainda assim, esta lista **não vincula sozinha**: ela só acende o atalho na
 * tela. Marcar uma linha como serviço é afirmar "isto não consome nada" — se
 * errar, o item sai do CMV calado, que é o pior jeito de errar. Um bar que
 * batize um prato de "TAXA DO CHEF" não pode perder o custo dele por causa de
 * uma lista de palavras nossa.
 */
const PALAVRAS_DE_SERVICO = [
  'COUVERT',
  'TAXA DE SERVICO',
  'TAXA SERVICO',
  'TAXA ROLHA',
  'ROLHA',
  'GORJETA',
  'SERVICO 10',
  'ENTRADA ARTISTICA',
]

export function pareceServico(nome: string): boolean {
  const chave = chaveBusca(nome)
  return PALAVRAS_DE_SERVICO.some((palavra) => chave.includes(palavra))
}

export function casarVendaDaPlanilha(
  descricao: string,
  contexto: {
    fichas: FichaCandidata[]
    produtos: ProdutoCandidato[]
    apelidos?: ApelidoDeVenda[]
  },
): CasamentoDeVenda {
  const chave = chaveBusca(descricao)
  const vendaveis = contexto.fichas.filter((f) => f.ativo && !f.producao)

  // 1. Alguém já disse, à mão, o que este nome é. Vale mais que tudo.
  const apelido = (contexto.apelidos ?? []).find((a) => chaveBusca(a.apelido) === chave)
  if (apelido) {
    return {
      alvo: apelido.alvo,
      fichaId: apelido.ficha_id,
      produtoId: apelido.produto_id,
      motivo: 'apelido',
      explicacao:
        apelido.alvo === 'servico'
          ? 'Este nome já foi marcado à mão como serviço: ele fatura e não consome insumo.'
          : 'Este nome já foi vinculado à mão neste restaurante.',
      pareceServico: pareceServico(descricao),
    }
  }

  // 2. Nome idêntico ao da ficha. A ficha vem antes do produto de propósito:
  //    ela sabe explodir em vários insumos, e o produto direto é o caso
  //    especial da garrafa vendida inteira.
  const fichaIgual = vendaveis.find((f) => chaveBusca(f.nome) === chave)
  if (fichaIgual) {
    return {
      alvo: 'ficha',
      fichaId: fichaIgual.id,
      produtoId: null,
      motivo: 'nome_identico',
      explicacao: `O nome é igual ao da ficha "${fichaIgual.nome}".`,
      pareceServico: false,
    }
  }

  const produtoIgual = porNomeIdentico(descricao, contexto.produtos)
  if (produtoIgual) {
    return {
      alvo: 'produto',
      fichaId: null,
      produtoId: produtoIgual.id,
      motivo: 'nome_identico',
      explicacao:
        `O nome é igual ao do insumo "${produtoIgual.nome}", e não há ficha com este nome: ` +
        'a venda aponta direto para o insumo, como a garrafa vendida inteira.',
      pareceServico: false,
    }
  }

  const servico = pareceServico(descricao)
  return {
    alvo: 'pendente',
    fichaId: null,
    produtoId: null,
    motivo: servico ? 'servico_sugerido' : 'pendente',
    explicacao: servico
      ? 'Este nome tem cara de serviço (couvert, taxa). Confirme: serviço fatura e não consome insumo nenhum.'
      : 'Nenhum vínculo garantido para este nome. Escolha a ficha, o insumo, ou marque como serviço.',
    pareceServico: servico,
  }
}

// ------------------------------------------------------------ auxiliares ---

function porNomeIdentico<T extends { id: string; nome: string }>(
  descricao: string,
  candidatos: readonly T[],
): T | null {
  const chave = chaveBusca(descricao)
  if (chave === '') return null
  const iguais = candidatos.filter((c) => chaveBusca(c.nome) === chave)
  // Dois cadastros com o mesmo nome normalizado: ninguém decide sozinho qual é.
  // Não acontece com `fichas_nome_unico`, mas acontece com insumo que difere só
  // por pontuação ("COCA-COLA" e "COCA COLA").
  return iguais.length === 1 ? (iguais[0] as T) : null
}

/**
 * O fator da unidade do PDV para a unidade de compra do insumo.
 *
 * É o gêmeo em TypeScript de `mv_fator_para_produto` (0017), e existe por um
 * motivo só: a tela precisa avisar ANTES do clique. Quem decide continua sendo
 * o banco — `mv_vendas_por_produto` (0028) marca a linha com o motivo escrito
 * se a conversão não existir, e é esse número que o relatório mostra.
 *
 * Por que isto importa, medido na planilha de setembro contra o catálogo do
 * primeiro cliente: `PASTEL DE CAMARAO UND` (R$ 2.184,30, vendido em UN) tem
 * botão de um clique para o insumo `PASTEL DE CAMARÃO`, que é contado em **KG**.
 * `CARNE SECA COM AIPIM` (R$ 4.060,35, em UN) tem botão para `CARNE SECA`,
 * também em KG. São dois cliques inocentes que criam duas linhas sem conversão
 * possível — e nenhuma tela dizia isso antes de clicar.
 *
 * Nulo = não há conversão. Nunca 1: chutar 1 aqui é o que a 0017 chama de "pôr
 * 60 garrafas de cachaça numa caipirinha".
 */
export function fatorParaInsumo(
  unidadeDaVenda: string | null | undefined,
  produto: { unidade: string; conteudo_quantidade?: number | null; conteudo_unidade?: string | null },
): number | null {
  // Sem unidade dita, a quantidade já está na unidade do insumo — é o que o
  // lançamento feito à mão sempre significou.
  const de = unidadeDaVenda ?? produto.unidade
  const direto = fatorEntreUnidades(de, produto.unidade)
  if (direto !== null) return direto
  // Pela embalagem: 60 ML numa garrafa de 965 ML. Nenhum dos 906 insumos do
  // primeiro cliente tem conteúdo preenchido hoje, mas a regra é a do banco.
  if (produto.conteudo_quantidade && produto.conteudo_quantidade > 0 && produto.conteudo_unidade) {
    const ate = fatorEntreUnidades(de, produto.conteudo_unidade)
    if (ate !== null) return ate / produto.conteudo_quantidade
  }
  return null
}

/**
 * As melhores parecenças para um nome, do mais parecido ao menos.
 *
 * Separada do casamento porque custa caro e quase nunca é precisa: o catálogo
 * do primeiro cliente tem 906 insumos e 69 fichas, e calcular parecença de
 * tudo contra tudo são 975 contas por linha. Medido com a planilha de compras
 * (693 linhas), fazer isso para TODA linha levava mais de 3 segundos de
 * navegador travado — e 351 daquelas linhas já tinham vínculo certo e não
 * precisavam de sugestão nenhuma.
 *
 * Então a tela chama isto só para a linha pendente que está mostrando, e
 * guarda o resultado por nome: na planilha de compras são 140 nomes distintos
 * pendentes, não 342 linhas.
 */
/**
 * Os nomes do cadastro que COMEÇAM com o nome do PDV, quando há mais de um.
 *
 * O caso, medido com o catálogo do primeiro cliente e o piso de 72%:
 *
 *     RED BULL C   R$ 562,86
 *       100,0%  RED BULL          <- e este botão é o primeiro da fila
 *        75,0%  RED BULL CEREJA
 *        75,0%  RED BULL COCO
 *        72,5%  RED BULL AÇAI
 *        72,5%  RED BULL ZERO
 *
 * Cinco candidatos passam o piso, e nenhum piso conserta isso — o problema não
 * é a altura, é que `RED BULL C` é um nome **cortado pelo PDV** e a parecença
 * não tem como saber do que. Os 100% não são identidade: `similaridadeTexto`
 * devolve 1 quando toda palavra do nome curto está no longo E ele é prefixo
 * dele, que é exatamente a forma de um nome truncado. Um botão de 100% lido
 * como certeza, apontando para o nome mais curto, é o convite a errar.
 *
 * Esta função responde à pergunta que a tela tem de fazer antes de mostrar o
 * botão: existe mais de um nome no cadastro que este nome cortado poderia ser?
 * Dois ou mais, e a resposta honesta não é um botão, é a lista — porque a
 * diferença entre RED BULL CEREJA e RED BULL COCO está justamente na letra que
 * o PDV cortou.
 *
 * Só conta nome ESTRITAMENTE mais longo: nome idêntico é identidade, e quem
 * resolve identidade é o degrau de cima do casamento, não a parecença.
 */
export function nomesQuePodemSerOCortado(
  descricao: string,
  contexto: { fichas?: readonly FichaCandidata[]; produtos: readonly ProdutoCandidato[] },
): string[] {
  const chave = chaveBusca(descricao)
  // Um nome curtíssimo é prefixo de meio catálogo, e dizer isso não ajuda
  // ninguém. Quatro caracteres é o mínimo para a pergunta fazer sentido.
  if (chave.length < 4) return []
  const todos = [
    ...(contexto.fichas ?? []).filter((f) => f.ativo && !f.producao).map((f) => f.nome),
    ...contexto.produtos.map((p) => p.nome),
  ]
  return todos
    .filter((nome) => {
      const outro = chaveBusca(nome)
      return outro.length > chave.length && outro.startsWith(chave)
    })
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function sugerirAlvos(
  descricao: string,
  contexto: { fichas?: readonly FichaCandidata[]; produtos: readonly ProdutoCandidato[] },
  quantas = 4,
): SugestaoDeAlvo[] {
  const fichas = (contexto.fichas ?? []).filter((f) => f.ativo && !f.producao)
  return [
    ...fichas.map((f) => ({
      tipo: 'ficha' as const,
      id: f.id,
      nome: f.nome,
      confianca: similaridadeTexto(descricao, f.nome),
    })),
    ...contexto.produtos.map((p) => ({
      tipo: 'produto' as const,
      id: p.id,
      nome: p.nome,
      confianca: similaridadeTexto(descricao, p.nome),
    })),
  ]
    .filter((s) => s.confianca > 0)
    .sort((a, b) => b.confianca - a.confianca || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, quantas)
}
