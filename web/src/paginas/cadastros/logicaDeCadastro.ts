/**
 * A lógica comum de categorias (1.2) e setores (1.3).
 *
 * As duas telas são irmãs de propósito: mesmo desenho, mesmas colunas, mesmo
 * formulário. O que muda entre elas é o *efeito* de desativar — categoria
 * some do agrupamento do CMV, setor some da folha de contagem —, e é isso que
 * as funções daqui sabem dizer em português antes de o admin clicar.
 */
import { chaveBusca } from '@/util/formato'
import type { Categoria, ProdutoCompleto, Setor } from '@/tipos/banco'

export type TipoDeCadastro = 'categoria' | 'setor'

/** Categoria e setor têm a mesma forma — o código trata os dois igual. */
export type ItemDeCadastro = Categoria | Setor

export interface RascunhoDeCadastro {
  id?: string
  nome: string
  descricao: string
  cor: string
  ordem: number
  ativo: boolean
}

export interface ProblemaDeCadastro {
  campo: 'nome' | 'cor' | 'ordem'
  mensagem: string
}

/**
 * Cor inicial de um item novo. Não é cor de marca — é o mesmo literal do
 * `DEFAULT` da coluna `cor` em `categorias` e `setores`, repetido aqui para
 * que o formulário mostre desde o primeiro quadro o que o banco gravaria.
 */
export const COR_PADRAO = '#6B7280'

export const ROTULOS: Record<
  TipoDeCadastro,
  {
    singular: string
    plural: string
    artigo: string
    umNovo: string
    /** Concordância inteira, para o texto não sair “Nenhuma setor cadastrada”. */
    nenhumCadastrado: string
    inativos: string
  }
> = {
  categoria: {
    singular: 'categoria',
    plural: 'categorias',
    artigo: 'a',
    umNovo: 'Nova categoria',
    nenhumCadastrado: 'Nenhuma categoria cadastrada',
    inativos: 'inativas',
  },
  setor: {
    singular: 'setor',
    plural: 'setores',
    artigo: 'o',
    umNovo: 'Novo setor',
    nenhumCadastrado: 'Nenhum setor cadastrado',
    inativos: 'inativos',
  },
}

/* ========================================================================== */
/* Uso: quantos produtos dependem de cada item                                */
/* ========================================================================== */

/**
 * Quantos produtos ativos usam cada categoria / vivem em cada setor. É a
 * coluna que dá peso à decisão de desativar: "3 produtos" e "217 produtos"
 * não são o mesmo clique.
 */
export function contarUso(
  produtos: readonly ProdutoCompleto[],
  tipo: TipoDeCadastro,
): Map<string, number> {
  const contagem = new Map<string, number>()
  for (const p of produtos) {
    if (!p.ativo) continue
    if (tipo === 'categoria') {
      if (!p.categoria_id) continue
      contagem.set(p.categoria_id, (contagem.get(p.categoria_id) ?? 0) + 1)
    } else {
      for (const s of p.setores) {
        contagem.set(s.setor_id, (contagem.get(s.setor_id) ?? 0) + 1)
      }
    }
  }
  return contagem
}

/* ========================================================================== */
/* Validação                                                                  */
/* ========================================================================== */

const HEX = /^#[0-9a-f]{6}$/i

/** O banco tem índice único por nome sem acento — avisamos antes do erro 23505. */
export function nomeDuplicado(
  nome: string,
  itens: readonly ItemDeCadastro[],
  idAtual?: string,
): boolean {
  const alvo = chaveBusca(nome)
  if (alvo === '') return false
  return itens.some((i) => i.id !== idAtual && chaveBusca(i.nome) === alvo)
}

export function validarCadastro(
  rascunho: RascunhoDeCadastro,
  itens: readonly ItemDeCadastro[],
  tipo: TipoDeCadastro,
): ProblemaDeCadastro[] {
  const problemas: ProblemaDeCadastro[] = []
  const rotulo = ROTULOS[tipo].singular

  if (rascunho.nome.trim() === '') {
    problemas.push({ campo: 'nome', mensagem: `Dê um nome ${tipo === 'setor' ? 'ao' : 'à'} ${rotulo}.` })
  } else if (nomeDuplicado(rascunho.nome, itens, rascunho.id)) {
    problemas.push({
      campo: 'nome',
      mensagem: `Já existe ${tipo === 'setor' ? 'um' : 'uma'} ${rotulo} com esse nome — o banco compara sem acento e sem caixa.`,
    })
  }

  if (!HEX.test(rascunho.cor)) {
    problemas.push({ campo: 'cor', mensagem: 'A cor precisa ser um hexadecimal como #1B7F5A.' })
  }

  if (!Number.isInteger(rascunho.ordem) || rascunho.ordem < 0) {
    problemas.push({ campo: 'ordem', mensagem: 'A ordem é um número inteiro a partir de zero.' })
  }

  return problemas
}

export function rascunhoDeCadastro(item: ItemDeCadastro | null, proximaOrdem: number): RascunhoDeCadastro {
  return {
    ...(item?.id ? { id: item.id } : {}),
    nome: item?.nome ?? '',
    descricao: item?.descricao ?? '',
    cor: item?.cor ?? COR_PADRAO,
    ordem: item?.ordem ?? proximaOrdem,
    ativo: item?.ativo ?? true,
  }
}

/* ========================================================================== */
/* Ordem                                                                      */
/* ========================================================================== */

/** A ordem que a tela mostra: `ordem` manda, o nome desempata. */
export function ordenarCadastro<T extends ItemDeCadastro>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return chaveBusca(a.nome).localeCompare(chaveBusca(b.nome), 'pt-BR')
  })
}

export interface AjusteDeOrdem {
  id: string
  ordem: number
}

/**
 * Sobe ou desce um item uma posição e devolve **só** as linhas que mudaram de
 * valor, já renumeradas de 0 em diante.
 *
 * Renumerar tudo é de propósito: o cadastro que veio da planilha do cliente
 * tem `ordem` repetida em vários itens, e trocar só dois números manteria o
 * empate. Devolver apenas o que mudou evita mandar 40 updates para arrastar
 * um item.
 */
export function moverNaOrdem<T extends ItemDeCadastro>(
  itens: readonly T[],
  id: string,
  direcao: 'cima' | 'baixo',
): AjusteDeOrdem[] {
  const lista = ordenarCadastro(itens)
  const atual = lista.findIndex((i) => i.id === id)
  if (atual < 0) return []

  const destino = direcao === 'cima' ? atual - 1 : atual + 1
  if (destino < 0 || destino >= lista.length) return []

  const a = lista[atual]
  const b = lista[destino]
  if (!a || !b) return []
  lista[atual] = b
  lista[destino] = a

  const ajustes: AjusteDeOrdem[] = []
  lista.forEach((item, indice) => {
    if (item.ordem !== indice) ajustes.push({ id: item.id, ordem: indice })
  })
  return ajustes
}

/** A ordem de um item novo: sempre no fim da fila. */
export function proximaOrdem(itens: readonly ItemDeCadastro[]): number {
  return itens.reduce((maior, i) => Math.max(maior, i.ordem), -1) + 1
}

/* ========================================================================== */
/* Desativar                                                                  */
/* ========================================================================== */

/**
 * O que o admin precisa ler antes de desativar algo em uso. O dado nunca some
 * — contagem fechada é foto e não se mexe —, mas a *próxima* contagem muda, e
 * isso é diferente para categoria e para setor:
 *
 *   setor inativo  → `mv_abrir_contagem` não gera mais linha para ele.
 *   categoria inativa → os produtos continuam sendo contados; o que some é o
 *                       agrupamento no CMV por categoria e o filtro da lista.
 */
export function avisoDeDesativacao(tipo: TipoDeCadastro, emUso: number): string {
  const nada = 'Nenhum produto ativo usa este cadastro hoje.'
  if (emUso === 0) return `${nada} Desativar não muda nenhuma contagem.`

  const quantos = `${emUso} ${emUso === 1 ? 'produto' : 'produtos'}`
  if (tipo === 'setor') {
    return (
      `${quantos} ${emUso === 1 ? 'é contado' : 'são contados'} neste setor. ` +
      'Desativando, eles somem da próxima folha de contagem — as contagens já fechadas continuam intactas.'
    )
  }
  return (
    `${quantos} ${emUso === 1 ? 'está' : 'estão'} nesta categoria. ` +
    'Desativando, eles continuam sendo contados, mas somem do CMV por categoria e dos filtros — as contagens já fechadas continuam intactas.'
  )
}

/* ========================================================================== */
/* Busca                                                                      */
/* ========================================================================== */

export function filtrarCadastro<T extends ItemDeCadastro>(
  itens: readonly T[],
  busca: string,
  mostrarInativos: boolean,
): T[] {
  const alvo = chaveBusca(busca)
  return itens.filter((i) => {
    if (!mostrarInativos && !i.ativo) return false
    if (alvo === '') return true
    const texto = chaveBusca(`${i.nome} ${i.descricao ?? ''}`)
    return alvo.split(' ').every((termo) => texto.includes(termo))
  })
}
