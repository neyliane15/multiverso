/**
 * O cadastro do cliente: slug, validação e as escolhas operacionais.
 *
 * O slug é a única coisa aqui que o usuário não escreve do zero — ele sai do
 * nome e continua editável. Tem de sobreviver a "Restaurante Açaí & Cia."
 * virando parte de URL, e é `unique` no banco: gerar errado é erro 23505 na
 * cara de quem estava só cadastrando um cliente.
 */
import { chaveBusca } from '@/util/formato'
import type { Restaurante } from '@/tipos/banco'

/* ========================================================================== */
/* Slug                                                                       */
/* ========================================================================== */

const LIMITE_DO_SLUG = 48

/**
 * 'Restaurante Açaí & Cia. — Unidade Centro' -> 'restaurante-acai-cia-unidade'.
 *
 * Tira acento pela decomposição (o mesmo caminho do `unaccent` do banco),
 * derruba tudo que não é letra/número para hífen e corta no limite sem deixar
 * hífen pendurado na ponta.
 */
export function gerarSlug(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base.length <= LIMITE_DO_SLUG) return base
  return base.slice(0, LIMITE_DO_SLUG).replace(/-+$/g, '')
}

const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugValido(slug: string): boolean {
  return slug.length > 0 && slug.length <= LIMITE_DO_SLUG && SLUG_VALIDO.test(slug)
}

export interface RestauranteConhecido {
  id: string
  nome: string
  slug: string
}

export function slugDuplicado(
  slug: string,
  existentes: readonly RestauranteConhecido[],
  idAtual?: string,
): boolean {
  if (slug === '') return false
  return existentes.some((r) => r.id !== idAtual && r.slug === slug)
}

/**
 * Se 'bar-do-ze' já existe, tenta 'bar-do-ze-2', 'bar-do-ze-3'... Serve para o
 * master cadastrar a segunda unidade sem parar para inventar um apelido.
 */
export function slugLivre(
  base: string,
  existentes: readonly RestauranteConhecido[],
  idAtual?: string,
): string {
  if (base === '') return base
  if (!slugDuplicado(base, existentes, idAtual)) return base
  for (let n = 2; n < 100; n += 1) {
    const tentativa = `${base.slice(0, LIMITE_DO_SLUG - String(n).length - 1)}-${n}`
    if (!slugDuplicado(tentativa, existentes, idAtual)) return tentativa
  }
  return base
}

/* ========================================================================== */
/* Escolhas operacionais                                                      */
/* ========================================================================== */

/** 0 = domingo, como no CHECK de `dia_virada_semana`. */
export const DIAS_DA_SEMANA: readonly { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: 'Domingo' },
  { valor: 1, rotulo: 'Segunda-feira' },
  { valor: 2, rotulo: 'Terça-feira' },
  { valor: 3, rotulo: 'Quarta-feira' },
  { valor: 4, rotulo: 'Quinta-feira' },
  { valor: 5, rotulo: 'Sexta-feira' },
  { valor: 6, rotulo: 'Sábado' },
]

/** Os fusos que existem no Brasil, mais o de quem opera de fora. */
export const FUSOS: readonly { valor: string; rotulo: string }[] = [
  { valor: 'America/Sao_Paulo', rotulo: 'Brasília (UTC−3)' },
  { valor: 'America/Bahia', rotulo: 'Bahia (UTC−3)' },
  { valor: 'America/Fortaleza', rotulo: 'Fortaleza (UTC−3)' },
  { valor: 'America/Recife', rotulo: 'Recife (UTC−3)' },
  { valor: 'America/Belem', rotulo: 'Belém (UTC−3)' },
  { valor: 'America/Manaus', rotulo: 'Manaus (UTC−4)' },
  { valor: 'America/Cuiaba', rotulo: 'Cuiabá (UTC−4)' },
  { valor: 'America/Campo_Grande', rotulo: 'Campo Grande (UTC−4)' },
  { valor: 'America/Porto_Velho', rotulo: 'Porto Velho (UTC−4)' },
  { valor: 'America/Boa_Vista', rotulo: 'Boa Vista (UTC−4)' },
  { valor: 'America/Rio_Branco', rotulo: 'Rio Branco (UTC−5)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha (UTC−2)' },
  { valor: 'UTC', rotulo: 'UTC' },
]

/* ========================================================================== */
/* Rascunho e validação                                                       */
/* ========================================================================== */

export interface RascunhoDeRestaurante {
  id?: string
  nome: string
  slug: string
  /** Só dígitos; a máscara é da exibição. */
  documento: string
  unidade: string
  fuso: string
  dia_virada_semana: number
  ativo: boolean
}

export interface ProblemaDeRestaurante {
  campo: keyof RascunhoDeRestaurante
  mensagem: string
}

export function rascunhoDeRestaurante(r: Restaurante | null): RascunhoDeRestaurante {
  return {
    ...(r?.id ? { id: r.id } : {}),
    nome: r?.nome ?? '',
    slug: r?.slug ?? '',
    documento: r?.documento ?? '',
    unidade: r?.unidade ?? '',
    fuso: r?.fuso ?? 'America/Sao_Paulo',
    dia_virada_semana: r?.dia_virada_semana ?? 1,
    ativo: r?.ativo ?? true,
  }
}

/** CNPJ tem 14 dígitos, CPF tem 11. Vazio é aceito: nem todo cliente informa. */
export function documentoAceitavel(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '')
  return digitos.length === 0 || digitos.length === 11 || digitos.length === 14
}

export function validarRestaurante(
  rascunho: RascunhoDeRestaurante,
  existentes: readonly RestauranteConhecido[],
): ProblemaDeRestaurante[] {
  const problemas: ProblemaDeRestaurante[] = []

  if (rascunho.nome.trim() === '') {
    problemas.push({ campo: 'nome', mensagem: 'O restaurante precisa de um nome.' })
  } else if (
    existentes.some(
      (r) => r.id !== rascunho.id && chaveBusca(r.nome) === chaveBusca(rascunho.nome),
    )
  ) {
    problemas.push({
      campo: 'nome',
      mensagem: 'Já existe um restaurante com esse nome. Use a unidade para diferenciar filiais.',
    })
  }

  if (!slugValido(rascunho.slug)) {
    problemas.push({
      campo: 'slug',
      mensagem: 'O slug aceita letras minúsculas, números e hífen — sem acento e sem espaço.',
    })
  } else if (slugDuplicado(rascunho.slug, existentes, rascunho.id)) {
    problemas.push({ campo: 'slug', mensagem: 'Este slug já pertence a outro restaurante.' })
  }

  if (!documentoAceitavel(rascunho.documento)) {
    problemas.push({
      campo: 'documento',
      mensagem: 'O documento precisa ter 14 dígitos (CNPJ) ou 11 (CPF) — ou ficar em branco.',
    })
  }

  if (
    !Number.isInteger(rascunho.dia_virada_semana) ||
    rascunho.dia_virada_semana < 0 ||
    rascunho.dia_virada_semana > 6
  ) {
    problemas.push({ campo: 'dia_virada_semana', mensagem: 'Escolha um dia da semana.' })
  }

  return problemas
}

/** O que vai para `restaurantes`. Campo vazio vira null, não string vazia. */
export function restauranteDoRascunho(rascunho: RascunhoDeRestaurante): Partial<Restaurante> & {
  id?: string
} {
  const digitos = rascunho.documento.replace(/\D/g, '')
  return {
    ...(rascunho.id ? { id: rascunho.id } : {}),
    nome: rascunho.nome.trim(),
    slug: rascunho.slug,
    documento: digitos === '' ? null : digitos,
    unidade: rascunho.unidade.trim() === '' ? null : rascunho.unidade.trim(),
    fuso: rascunho.fuso,
    dia_virada_semana: rascunho.dia_virada_semana,
    ativo: rascunho.ativo,
  }
}
