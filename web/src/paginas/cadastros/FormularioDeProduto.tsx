/**
 * O formulário do produto — e, dentro dele, a regra que desenha o módulo.
 *
 * Um produto tem UMA categoria e vive em VÁRIOS setores, e cada setor guarda a
 * própria unidade e o próprio custo. Isso não pode ficar escondido atrás de um
 * "avançado": marcar o setor abre, ali mesmo, a unidade e o custo daquele
 * setor. É o caso do FILÉ DE TILÁPIA — 41,50/KG no Estoque Geral e 6,34/UND
 * nos Porcionados — e de outros 13 produtos do primeiro cliente.
 */
import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Save } from 'lucide-react'
import {
  Aviso,
  Botao,
  Campo,
  CampoNumero,
  Chip,
  Rotulo,
  Selecao,
  Selo,
} from '@/componentes/base'
import { dinheiro } from '@/util/formato'
import type { Categoria, Estoque, ProdutoCompleto, Setor } from '@/tipos/banco'
import type { VinculoSetor } from '@/dados/consultas'
import { PainelLateral } from '../PainelLateral'
import {
  UNIDADES_COMUNS,
  produtoDoRascunho,
  rascunhoDeProduto,
  validarProduto,
  vinculosDoRascunho,
  type RascunhoDeProduto,
  type RascunhoDeSetor,
  type SetorDisponivel,
} from './logicaDeProdutos'

export interface PropsDoFormularioDeProduto {
  /** null = produto novo. */
  produto: ProdutoCompleto | null
  categorias: readonly Categoria[]
  setores: readonly Setor[]
  /** Os estoques de setor do restaurante inteiro; o form agrupa por setor. */
  estoques: readonly Estoque[]
  /** O catálogo inteiro, só para avisar de nome repetido antes do banco. */
  produtos: readonly ProdutoCompleto[]
  podeEditar: boolean
  salvando: boolean
  erroDoServidor: string | null
  aoSalvar: (entrada: {
    produto: ReturnType<typeof produtoDoRascunho>
    setores: VinculoSetor[]
  }) => void
  aoArquivar: (ativo: boolean) => void
  aoFechar: () => void
}

function ListaDeUnidades({ id }: { id: string }): JSX.Element {
  return (
    <datalist id={id}>
      {UNIDADES_COMUNS.map((u) => (
        <option key={u} value={u} />
      ))}
    </datalist>
  )
}

export function FormularioDeProduto({
  produto,
  categorias,
  setores,
  estoques,
  produtos,
  podeEditar,
  salvando,
  erroDoServidor,
  aoSalvar,
  aoArquivar,
  aoFechar,
}: PropsDoFormularioDeProduto): JSX.Element {
  const disponiveis: SetorDisponivel[] = useMemo(
    () =>
      setores
        .filter((s) => s.ativo)
        .map((s) => ({
          id: s.id,
          nome: s.nome,
          cor: s.cor,
          estoques: estoques
            .filter((e) => e.setor_id === s.id && e.ativo)
            .map((e) => ({ id: e.id, nome: e.nome })),
        })),
    [setores, estoques],
  )

  const [rascunho, setRascunho] = useState<RascunhoDeProduto>(() =>
    rascunhoDeProduto(produto, disponiveis),
  )
  const [tentouSalvar, setTentouSalvar] = useState(false)

  const problemas = useMemo(
    () => validarProduto(rascunho, disponiveis, produtos),
    [rascunho, disponiveis, produtos],
  )
  const problemaDe = (campo: string) => problemas.find((p) => p.campo === campo)?.mensagem
  const mostrar = (campo: string) => (tentouSalvar ? problemaDe(campo) : undefined)

  const marcados = disponiveis.filter((s) => rascunho.setores[s.id]?.marcado)

  function mudarSetor(id: string, mudanca: Partial<RascunhoDeSetor>) {
    setRascunho((r) => {
      const atual: RascunhoDeSetor = r.setores[id] ?? {
        marcado: false,
        unidade: r.unidade,
        custo: r.custo_medio,
        custoFixo: false,
        estoques: [],
      }
      return { ...r, setores: { ...r.setores, [id]: { ...atual, ...mudanca } } }
    })
  }

  /** Marca ou desmarca um lugar dentro do setor. */
  function alternarEstoque(setorId: string, estoqueId: string) {
    const atuais = rascunho.setores[setorId]?.estoques ?? []
    mudarSetor(setorId, {
      estoques: atuais.includes(estoqueId)
        ? atuais.filter((id) => id !== estoqueId)
        : [...atuais, estoqueId],
    })
  }

  function salvar() {
    setTentouSalvar(true)
    if (problemas.length > 0) return
    aoSalvar({ produto: produtoDoRascunho(rascunho), setores: vinculosDoRascunho(rascunho) })
  }

  const idUnidades = `unidades-${produto?.id ?? 'novo'}`

  return (
    <PainelLateral
      aberto
      largura="larga"
      titulo={produto ? produto.nome : 'Novo produto'}
      descricao={
        produto
          ? 'Cada setor marcado guarda a própria unidade e o próprio custo.'
          : 'Um produto, uma categoria, e um ou mais setores onde ele é contado.'
      }
      aoFechar={aoFechar}
      rodape={
        podeEditar ? (
          <>
            {produto && (
              <Botao
                tom={produto.ativo ? 'perigo' : 'secundario'}
                icone={
                  produto.ativo ? (
                    <Archive className="size-4" aria-hidden />
                  ) : (
                    <ArchiveRestore className="size-4" aria-hidden />
                  )
                }
                onClick={() => aoArquivar(!produto.ativo)}
                className="mr-auto"
              >
                {produto.ativo ? 'Arquivar' : 'Reativar'}
              </Botao>
            )}
            <Botao tom="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao
              tom="primario"
              carregando={salvando}
              onClick={salvar}
              icone={<Save className="size-4" aria-hidden />}
            >
              Salvar produto
            </Botao>
          </>
        ) : (
          <Botao tom="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
        )
      }
    >
      <fieldset disabled={!podeEditar} className="space-y-6">
        {!podeEditar && (
          <Aviso tom="info" titulo="Somente leitura">
            Seu papel enxerga o catálogo, mas quem altera cadastro é o gerente, o admin ou um master.
          </Aviso>
        )}

        {erroDoServidor && (
          <Aviso tom="erro" titulo="O banco recusou o salvamento">
            {erroDoServidor}
          </Aviso>
        )}

        {tentouSalvar && problemas.length > 0 && (
          <Aviso tom="alerta" titulo="Falta acertar antes de salvar">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {problemas.map((p) => (
                <li key={`${p.campo}-${p.mensagem}`}>{p.mensagem}</li>
              ))}
            </ul>
          </Aviso>
        )}

        {/* ─────────────────────────────────────────────── identificação ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Rotulo para="produto-nome">Nome</Rotulo>
            <Campo
              id="produto-nome"
              className="mt-1.5"
              value={rascunho.nome}
              autoFocus
              aria-invalid={Boolean(mostrar('nome'))}
              onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
              placeholder="FILÉ DE TILÁPIA"
            />
            {mostrar('nome') && (
              <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
                {mostrar('nome')}
              </p>
            )}
          </div>

          <div>
            <Rotulo para="produto-codigo">Código interno</Rotulo>
            <Campo
              id="produto-codigo"
              className="mt-1.5"
              value={rascunho.codigo}
              onChange={(e) => setRascunho((r) => ({ ...r, codigo: e.target.value }))}
              placeholder="opcional"
            />
          </div>

          <div>
            <Rotulo para="produto-categoria">Categoria</Rotulo>
            <Selecao
              id="produto-categoria"
              className="mt-1.5"
              value={rascunho.categoria_id ?? ''}
              onChange={(e) =>
                setRascunho((r) => ({ ...r, categoria_id: e.target.value === '' ? null : e.target.value }))
              }
            >
              <option value="">Sem categoria</option>
              {categorias
                .filter((c) => c.ativo || c.id === rascunho.categoria_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.ativo ? '' : ' (inativa)'}
                  </option>
                ))}
            </Selecao>
            <p className="mt-1.5 text-micro text-texto-fraco">
              É por ela que o CMV se agrupa. Um produto tem uma só.
            </p>
          </div>

          <div>
            <Rotulo para="produto-unidade">Unidade de compra</Rotulo>
            <Campo
              id="produto-unidade"
              className="mt-1.5 uppercase"
              list={idUnidades}
              value={rascunho.unidade}
              onChange={(e) => setRascunho((r) => ({ ...r, unidade: e.target.value }))}
            />
            <ListaDeUnidades id={idUnidades} />
            <p className="mt-1.5 text-micro text-texto-fraco">
              A unidade da nota fiscal. A de contagem é a do setor, logo abaixo.
            </p>
          </div>

          <div>
            <Rotulo para="produto-custo">Custo de referência</Rotulo>
            <CampoNumero
              id="produto-custo"
              className="mt-1.5"
              valor={rascunho.custo_medio}
              aoMudar={(v) => setRascunho((r) => ({ ...r, custo_medio: v }))}
              aria-label="Custo de referência do produto, em reais"
            />
            <p className="mt-1.5 text-micro text-texto-fraco">
              Vale quando o setor não tem custo próprio.
            </p>
          </div>

          <div>
            <Rotulo para="produto-minimo">Estoque mínimo</Rotulo>
            <CampoNumero
              id="produto-minimo"
              className="mt-1.5"
              valor={rascunho.estoque_minimo}
              aoMudar={(v) => setRascunho((r) => ({ ...r, estoque_minimo: v }))}
              aria-label="Estoque mínimo"
            />
            <p className="mt-1.5 text-micro text-texto-fraco">
              A lista de compras sugere a diferença até este número.
            </p>
          </div>

          <label className="flex min-h-toque items-center gap-3 self-end">
            <input
              type="checkbox"
              className="size-4 accent-[var(--mv-primaria)]"
              checked={rascunho.perecivel}
              onChange={(e) => setRascunho((r) => ({ ...r, perecivel: e.target.checked }))}
            />
            <span className="text-corpo text-texto">Perecível</span>
          </label>

          <div className="sm:col-span-2">
            <Rotulo para="produto-observacao">Observação</Rotulo>
            <textarea
              id="produto-observacao"
              rows={2}
              value={rascunho.observacao}
              onChange={(e) => setRascunho((r) => ({ ...r, observacao: e.target.value }))}
              className="mt-1.5 w-full rounded-marca-p border border-borda bg-superficie-2 px-3 py-2 text-corpo text-texto outline-none transition-colors hover:border-borda-forte focus:border-primaria"
            />
          </div>
        </div>

        {/* ──────────────────────────────────────── setores, o coração ──── */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-titulo text-destaque font-semibold text-texto">
              Onde este produto é contado
            </h3>
            <span className="mv-numero text-apoio text-texto-fraco">
              {marcados.length} de {disponiveis.length}
            </span>
          </div>
          <p className="mt-1 text-apoio leading-relaxed text-texto-fraco">
            Marque cada setor em que o produto existe. Cada um guarda a própria unidade e o próprio
            custo — a mesma tilápia pode ser 41,50/KG no estoque e 6,34/UND já porcionada.
          </p>

          {mostrar('setores') && (
            <p role="alert" className="mt-2 text-apoio text-erro-texto">
              {mostrar('setores')}
            </p>
          )}

          {disponiveis.length === 0 ? (
            <Aviso tom="alerta" titulo="Nenhum setor ativo">
              Cadastre ao menos um setor antes: é o setor que diz onde o produto é contado.
            </Aviso>
          ) : (
            <ul className="mt-3 space-y-2">
              {disponiveis.map((setor) => {
                const linha = rascunho.setores[setor.id]
                const marcado = Boolean(linha?.marcado)
                const problema = mostrar(`setor:${setor.id}`)
                return (
                  <li
                    key={setor.id}
                    className={[
                      'rounded-marca border p-3 transition-colors',
                      marcado ? 'border-primaria bg-primaria-06' : 'border-borda',
                    ].join(' ')}
                  >
                    <label className="flex min-h-toque cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--mv-primaria)]"
                        checked={marcado}
                        onChange={(e) => mudarSetor(setor.id, { marcado: e.target.checked })}
                      />
                      <Selo cor={setor.cor}>{setor.nome}</Selo>
                    </label>

                    {marcado && linha && (
                      <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
                        <div>
                          <Rotulo para={`unidade-${setor.id}`}>Unidade em {setor.nome}</Rotulo>
                          <Campo
                            id={`unidade-${setor.id}`}
                            className="mt-1.5 uppercase"
                            list={idUnidades}
                            value={linha.unidade}
                            onChange={(e) => mudarSetor(setor.id, { unidade: e.target.value })}
                          />
                        </div>
                        <div>
                          <Rotulo para={`custo-${setor.id}`}>Custo em {setor.nome}</Rotulo>
                          <CampoNumero
                            id={`custo-${setor.id}`}
                            className="mt-1.5"
                            valor={linha.custo}
                            aoMudar={(v) => mudarSetor(setor.id, { custo: v })}
                            aria-label={`Custo do produto no setor ${setor.nome}, em reais`}
                          />
                          <p className="mt-1 text-micro text-texto-fraco">
                            {dinheiro(linha.custo)} por {linha.unidade.trim() || '—'}
                          </p>
                        </div>
                        {/* A marca que decide se a nota fiscal pode mexer neste
                            custo. Sem ela, a primeira nota de tilápia lançada
                            sobrescreveria a porção com o preço do quilo. */}
                        <label className="flex min-h-toque items-start gap-3 sm:col-span-2">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-[var(--mv-primaria)]"
                            checked={linha.custoFixo}
                            onChange={(e) => mudarSetor(setor.id, { custoFixo: e.target.checked })}
                          />
                          <span>
                            <span className="block text-corpo text-texto">
                              Custo calculado pela casa
                            </span>
                            <span className="block text-micro text-texto-fraco">
                              {linha.custoFixo
                                ? 'Nota fiscal não mexe neste valor — é porção, receita ou rendimento apurado por vocês.'
                                : 'Este custo acompanha a última compra lançada.'}
                            </span>
                          </span>
                        </label>

                        {/* Estoque de setor: onde, dentro do setor. Só aparece
                            para setor que tem lugares cadastrados — pedir
                            "escolha a geladeira" num setor que é uma câmara só
                            seria uma pergunta sem resposta. */}
                        <fieldset className="sm:col-span-2">
                          <legend className="mv-rotulo mb-2">
                            Estoque de setor em {setor.nome}
                          </legend>
                          {(setor.estoques ?? []).length === 0 ? (
                            <p className="text-micro text-texto-fraco">
                              {setor.nome} não tem estoques cadastrados: o produto é contado
                              pelo setor inteiro. Para separar por lugar, cadastre em
                              Cadastros › Estoques de setor.
                            </p>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {(setor.estoques ?? []).map((estoque) => (
                                  <Chip
                                    key={estoque.id}
                                    marcado={linha.estoques.includes(estoque.id)}
                                    aoAlternar={() => alternarEstoque(setor.id, estoque.id)}
                                  >
                                    {estoque.nome}
                                  </Chip>
                                ))}
                              </div>
                              <p className="mt-1.5 text-micro text-texto-fraco">
                                {linha.estoques.length === 0
                                  ? 'Nenhum marcado: o produto entra na folha uma vez, pelo setor inteiro.'
                                  : `${linha.estoques.length} ${linha.estoques.length === 1 ? 'lugar' : 'lugares'}: ${linha.estoques.length} ${linha.estoques.length === 1 ? 'linha' : 'linhas'} na folha de contagem deste setor.`}
                              </p>
                            </>
                          )}
                        </fieldset>

                        {problema && (
                          <p role="alert" className="text-apoio text-erro-texto sm:col-span-2">
                            {problema}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ──────────────────────────────────────────────── arquivamento ── */}
        {produto && (
          <Aviso tom="info" titulo="Por que arquivar e não apagar">
            <p className="mt-1">
              <span>
                Este produto pode estar em contagens já fechadas. Apagar reescreveria o histórico e o
                CMV daqueles períodos. Arquivar tira ele das próximas folhas e mantém tudo que já foi
                contado exatamente como estava.
              </span>
            </p>
          </Aviso>
        )}
      </fieldset>
    </PainelLateral>
  )
}
