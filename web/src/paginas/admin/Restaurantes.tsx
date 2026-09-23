/**
 * Administração · Restaurantes — o cadastro dos clientes do sistema.
 *
 * Só o master chega aqui (a RLS de `restaurantes` só deixa ele inserir).
 *
 * Detalhe que molda a tela: a sessão carrega os restaurantes **ativos** com
 * todas as colunas, e `vw_panorama_restaurantes` traz **todos**, inclusive os
 * desativados, mas só com um resumo. Então a lista sai do panorama — para que
 * um restaurante desativado não suma da administração — e o formulário
 * completo só abre para quem a sessão carregou inteiro. Para os desativados a
 * tela oferece reativar, que é um update de uma coluna só, e diz por quê.
 *
 * Criar um restaurante leva direto à identidade visual dele: é o passo
 * seguinte natural, e é literalmente o que o enunciado pede que exista.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Palette, Plus, Save, Store } from 'lucide-react'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Campo,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Rotulo,
  Selecao,
  Selo,
  Tabela,
  Th,
  Td,
  Linha,
} from '@/componentes/base'
import { LogoDoRestaurante } from '@/componentes/LogoDoRestaurante'
import { useSalvarRestaurante } from '@/dados/consultas'
import { usePanorama } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { data as formatarData, documento as formatarDocumento, quantidade } from '@/util/formato'
import type { Restaurante } from '@/tipos/banco'
import { PainelLateral } from '../PainelLateral'
import { marcaDoPanorama } from '../marcaDoPanorama'
import {
  DIAS_DA_SEMANA,
  FUSOS,
  gerarSlug,
  rascunhoDeRestaurante,
  restauranteDoRascunho,
  slugLivre,
  validarRestaurante,
  type RascunhoDeRestaurante,
  type RestauranteConhecido,
} from './logicaDeRestaurantes'

export function Restaurantes(): JSX.Element {
  const { restaurantesVisiveis, recarregar, trocarRestaurante } = useSessao()
  const panorama = usePanorama()
  const salvar = useSalvarRestaurante()
  const navegar = useNavigate()

  const [editando, setEditando] = useState<{ restaurante: Restaurante | null } | null>(null)

  const completos = useMemo(
    () => new Map(restaurantesVisiveis.map((r) => [r.id, r])),
    [restaurantesVisiveis],
  )

  const conhecidos: RestauranteConhecido[] = useMemo(
    () => (panorama.data ?? []).map((r) => ({ id: r.id, nome: r.nome, slug: r.slug })),
    [panorama.data],
  )

  const lista = useMemo(
    () => [...(panorama.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [panorama.data],
  )

  async function aoSalvar(rascunho: RascunhoDeRestaurante) {
    const novo = !rascunho.id
    const salvo = await salvar.mutateAsync(restauranteDoRascunho(rascunho))
    await recarregar()
    setEditando(null)
    if (novo) {
      // A marca nasce com os padrões do sistema, então a tela do cliente já
      // está inteira. O passo seguinte é dar a cara dele a ela.
      trocarRestaurante(salvo.id)
      navegar('/admin/identidade')
    }
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Restaurantes"
        descricao="Os clientes do sistema. Cadastrar um restaurante cria o tenant inteiro — cadastros, contagens e compras dele ficam isolados por RLS."
        acoes={
          <Botao
            tom="primario"
            icone={<Plus className="size-4" aria-hidden />}
            onClick={() => setEditando({ restaurante: null })}
          >
            Novo restaurante
          </Botao>
        }
      />

      <Cartao>
        {panorama.isPending ? (
          <Carregando linhas={5} />
        ) : panorama.isError ? (
          <ErroDaConsulta erro={panorama.error} aoTentar={() => void panorama.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio
            icone={<Store />}
            titulo="Nenhum restaurante cadastrado"
            acao={
              <Botao tom="primario" onClick={() => setEditando({ restaurante: null })}>
                Cadastrar o primeiro
              </Botao>
            }
          >
            Cadastre o restaurante, monte a identidade visual dele e convide o admin. Nessa ordem.
          </EstadoVazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Restaurante</Th>
                <Th className="hidden md:table-cell">Documento</Th>
                <Th numerico>Usuários</Th>
                <Th numerico className="hidden sm:table-cell">
                  Produtos
                </Th>
                <Th className="hidden lg:table-cell">Cadastrado</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => {
                const completo = completos.get(r.id) ?? null
                return (
                  <Linha
                    key={r.id}
                    aoClicar={() => setEditando({ restaurante: completo })}
                    className={r.ativo ? undefined : 'opacity-60'}
                  >
                    <Td>
                      <span className="flex items-center gap-3">
                        <LogoDoRestaurante
                          nome={r.nome}
                          logoUrl={r.logo_url}
                          marca={completo ?? marcaDoPanorama(r.cor_primaria, r.logo_url)}
                          tamanho={32}
                          decorativo
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-texto">{r.nome}</span>
                          <span className="block truncate text-micro text-texto-fraco">
                            {r.unidade ? `${r.unidade} · ` : ''}
                            {r.slug}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <span className="mv-numero text-apoio text-texto-suave">
                        {formatarDocumento(completo?.documento ?? null)}
                      </span>
                    </Td>
                    <Td numerico>{quantidade(r.usuarios)}</Td>
                    <Td numerico className="hidden sm:table-cell">
                      {quantidade(r.produtos)}
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <span className="mv-numero text-apoio text-texto-suave">
                        {formatarData(r.criado_em)}
                      </span>
                    </Td>
                    <Td>
                      {r.ativo ? <Selo tom="sucesso">ativo</Selo> : <Selo tom="neutro">inativo</Selo>}
                    </Td>
                  </Linha>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>

      {editando && (
        <FormularioDeRestaurante
          key={editando.restaurante?.id ?? 'novo'}
          restaurante={editando.restaurante}
          conhecidos={conhecidos}
          salvando={salvar.isPending}
          erroDoServidor={salvar.error instanceof Error ? salvar.error.message : null}
          aoSalvar={(r) => void aoSalvar(r)}
          aoFechar={() => {
            setEditando(null)
            salvar.reset()
          }}
          aoAbrirIdentidade={(id) => {
            trocarRestaurante(id)
            navegar('/admin/identidade')
          }}
        />
      )}
    </>
  )
}

/* ========================================================================== */
/* Formulário                                                                 */
/* ========================================================================== */

function FormularioDeRestaurante({
  restaurante,
  conhecidos,
  salvando,
  erroDoServidor,
  aoSalvar,
  aoFechar,
  aoAbrirIdentidade,
}: {
  restaurante: Restaurante | null
  conhecidos: readonly RestauranteConhecido[]
  salvando: boolean
  erroDoServidor: string | null
  aoSalvar: (rascunho: RascunhoDeRestaurante) => void
  aoFechar: () => void
  aoAbrirIdentidade: (id: string) => void
}): JSX.Element {
  const [rascunho, setRascunho] = useState<RascunhoDeRestaurante>(() =>
    rascunhoDeRestaurante(restaurante),
  )
  // O slug acompanha o nome até alguém mexer nele à mão. Depois disso ele é
  // decisão de quem cadastrou, e o nome não o reescreve mais.
  const [slugManual, setSlugManual] = useState(Boolean(restaurante))
  const [tentou, setTentou] = useState(false)

  const problemas = useMemo(
    () => validarRestaurante(rascunho, conhecidos),
    [rascunho, conhecidos],
  )
  const problemaDe = (campo: keyof RascunhoDeRestaurante) =>
    tentou ? problemas.find((p) => p.campo === campo)?.mensagem : undefined

  function mudarNome(nome: string) {
    setRascunho((r) => ({
      ...r,
      nome,
      slug: slugManual ? r.slug : slugLivre(gerarSlug(nome), conhecidos, r.id),
    }))
  }

  function enviar() {
    setTentou(true)
    if (problemas.length > 0) return
    aoSalvar(rascunho)
  }

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={restaurante ? restaurante.nome : 'Novo restaurante'}
      descricao={
        restaurante
          ? 'As cores e o logo ficam na tela de identidade visual.'
          : 'Depois de salvar, a próxima tela é a identidade visual deste restaurante.'
      }
      aoFechar={aoFechar}
      rodape={
        <>
          {restaurante && (
            <Botao
              tom="secundario"
              className="mr-auto"
              icone={<Palette className="size-4" aria-hidden />}
              onClick={() => aoAbrirIdentidade(restaurante.id)}
            >
              Identidade visual
            </Botao>
          )}
          <Botao tom="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            tom="primario"
            carregando={salvando}
            onClick={enviar}
            icone={<Save className="size-4" aria-hidden />}
          >
            {restaurante ? 'Salvar' : 'Cadastrar e ir para a identidade'}
          </Botao>
        </>
      }
    >
      <div className="space-y-5">
        {erroDoServidor && (
          <Aviso tom="erro" titulo="O banco recusou o salvamento">
            {erroDoServidor}
          </Aviso>
        )}

        <div>
          <Rotulo para="rest-nome">Nome</Rotulo>
          <Campo
            id="rest-nome"
            className="mt-1.5"
            autoFocus
            value={rascunho.nome}
            aria-invalid={Boolean(problemaDe('nome'))}
            onChange={(e) => mudarNome(e.target.value)}
            placeholder="Bar do Zé"
          />
          {problemaDe('nome') && (
            <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
              {problemaDe('nome')}
            </p>
          )}
        </div>

        <div>
          <Rotulo para="rest-slug">Slug</Rotulo>
          <Campo
            id="rest-slug"
            className="mt-1.5 lowercase"
            value={rascunho.slug}
            aria-invalid={Boolean(problemaDe('slug'))}
            aria-describedby="rest-slug-ajuda"
            onChange={(e) => {
              setSlugManual(true)
              setRascunho((r) => ({ ...r, slug: e.target.value.trim().toLowerCase() }))
            }}
          />
          {problemaDe('slug') ? (
            <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
              {problemaDe('slug')}
            </p>
          ) : (
            <p id="rest-slug-ajuda" className="mt-1.5 text-micro text-texto-fraco">
              Sai do nome, sem acento e sem espaço, e é único no sistema inteiro. Ainda dá para
              editar à mão.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Rotulo para="rest-documento">CNPJ ou CPF</Rotulo>
            <Campo
              id="rest-documento"
              className="mv-numero mt-1.5"
              inputMode="numeric"
              value={rascunho.documento}
              aria-invalid={Boolean(problemaDe('documento'))}
              onChange={(e) => setRascunho((r) => ({ ...r, documento: e.target.value }))}
              placeholder="opcional"
            />
            {problemaDe('documento') && (
              <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
                {problemaDe('documento')}
              </p>
            )}
          </div>

          <div>
            <Rotulo para="rest-unidade">Unidade</Rotulo>
            <Campo
              id="rest-unidade"
              className="mt-1.5"
              value={rascunho.unidade}
              onChange={(e) => setRascunho((r) => ({ ...r, unidade: e.target.value }))}
              placeholder="Centro, Filial 2…"
            />
            <p className="mt-1.5 text-micro text-texto-fraco">
              Diferencia filiais que dividem o mesmo nome.
            </p>
          </div>

          <div>
            <Rotulo para="rest-fuso">Fuso horário</Rotulo>
            <Selecao
              id="rest-fuso"
              className="mt-1.5"
              value={rascunho.fuso}
              onChange={(e) => setRascunho((r) => ({ ...r, fuso: e.target.value }))}
            >
              {FUSOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Selecao>
          </div>

          <div>
            <Rotulo para="rest-virada">Dia de virada da semana</Rotulo>
            <Selecao
              id="rest-virada"
              className="mt-1.5"
              value={rascunho.dia_virada_semana}
              onChange={(e) =>
                setRascunho((r) => ({
                  ...r,
                  dia_virada_semana: Number.parseInt(e.target.value, 10),
                }))
              }
            >
              {DIAS_DA_SEMANA.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </Selecao>
            <p className="mt-1.5 text-micro text-texto-fraco">
              É o dia em que a semana operacional começa no CMV semanal.
            </p>
          </div>
        </div>

        <label className="flex min-h-toque items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-[var(--mv-primaria)]"
            checked={rascunho.ativo}
            onChange={(e) => setRascunho((r) => ({ ...r, ativo: e.target.checked }))}
          />
          <span className="text-corpo text-texto">Ativo</span>
        </label>

        {restaurante && rascunho.ativo !== restaurante.ativo && !rascunho.ativo && (
          <Aviso tom="alerta" titulo="Desativar esconde o restaurante do seletor">
            Nenhum dado é apagado, e ele continua listado aqui e na Rede. Mas ele sai do seletor da
            barra de cima, e o formulário completo só volta a abrir depois de reativado.
          </Aviso>
        )}

        {!restaurante && (
          <Aviso tom="info" titulo="O que acontece ao salvar">
            O restaurante nasce com as cores e as fontes padrão do sistema, então a primeira tela
            dele já está inteira. Você vai direto para a identidade visual para trocar logo, cores e
            tipografia — e só depois convida o admin dele em Usuários.
          </Aviso>
        )}
      </div>
    </PainelLateral>
  )
}
