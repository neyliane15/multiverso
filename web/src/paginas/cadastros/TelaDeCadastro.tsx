/**
 * A tela que Categorias (1.2) e Setores (1.3) compartilham.
 *
 * As duas são irmãs de propósito: mesma grade, mesmo formulário, mesmos
 * controles de ordem. O que muda é o nome, o texto de ajuda e — o que
 * importa — o **efeito de desativar**, que `avisoDeDesativacao` escreve por
 * extenso antes de a pessoa confirmar.
 *
 * Uma tela só em vez de duas quase iguais: quando o desenho mudar, muda nos
 * dois lugares de uma vez, e elas não divergem devagar.
 */
import { useMemo, useState } from 'react'
import { Boxes, ChevronDown, ChevronUp, Plus, Save, Tags } from 'lucide-react'
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  CabecalhoDePagina,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Rotulo,
  Selo,
  Tabela,
  Th,
  Td,
  Linha,
} from '@/componentes/base'
import { SeletorDeCor } from '@/componentes/CampoDeMarca'
import { useMarca } from '@/tema/ProvedorDeMarca'
import { contraste } from '@/tema/marca'
import { quantidade } from '@/util/formato'
import type { Categoria } from '@/tipos/banco'
import { PainelLateral } from '../PainelLateral'
import {
  ROTULOS,
  avisoDeDesativacao,
  filtrarCadastro,
  moverNaOrdem,
  ordenarCadastro,
  proximaOrdem,
  rascunhoDeCadastro,
  validarCadastro,
  type AjusteDeOrdem,
  type ItemDeCadastro,
  type RascunhoDeCadastro,
  type TipoDeCadastro,
} from './logicaDeCadastro'

export interface PropsDaTelaDeCadastro {
  tipo: TipoDeCadastro
  titulo: string
  descricao: string
  itens: readonly ItemDeCadastro[]
  /** Quantos produtos ativos dependem de cada item. */
  usos: Map<string, number>
  carregando: boolean
  erro: unknown
  aoTentarDeNovo: () => void
  podeEditar: boolean
  salvando: boolean
  erroDoServidor: string | null
  /**
   * Erro de uma ação feita fora do painel lateral — hoje, a reordenação.
   * `erroDoServidor` mora dentro do formulário, e o formulário está fechado
   * justamente quando alguém reordena: a falha sumiria sem deixar rastro.
   */
  erroDaLista: string | null
  aoSalvar: (dados: Partial<Categoria> & { id?: string }, aoTerminar: () => void) => void
  aoReordenar: (ajustes: AjusteDeOrdem[]) => void
}

/** 3:1 é o piso de AA para elemento gráfico — abaixo disso o selo some. */
const CONTRASTE_MINIMO = 3

export function TelaDeCadastro({
  tipo,
  titulo,
  descricao,
  itens,
  usos,
  carregando,
  erro,
  aoTentarDeNovo,
  podeEditar,
  salvando,
  erroDoServidor,
  erroDaLista,
  aoSalvar,
  aoReordenar,
}: PropsDaTelaDeCadastro): JSX.Element {
  const rotulos = ROTULOS[tipo]
  const { marca } = useMarca()

  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [editando, setEditando] = useState<{ item: ItemDeCadastro | null } | null>(null)

  const ordenados = useMemo(() => ordenarCadastro(itens), [itens])
  const visiveis = useMemo(
    () => filtrarCadastro(ordenados, busca, mostrarInativos),
    [ordenados, busca, mostrarInativos],
  )

  const Icone = tipo === 'categoria' ? Tags : Boxes

  return (
    <>
      <CabecalhoDePagina
        titulo={titulo}
        descricao={descricao}
        acoes={
          podeEditar && (
            <Botao
              tom="primario"
              icone={<Plus className="size-4" aria-hidden />}
              onClick={() => setEditando({ item: null })}
            >
              {rotulos.umNovo}
            </Botao>
          )
        }
      />

      <Cartao>
        <div className="flex flex-wrap items-center gap-3 border-b border-borda px-5 py-4">
          <Campo
            type="search"
            className="w-full sm:w-72"
            placeholder={`Buscar ${rotulos.singular}…`}
            aria-label={`Buscar ${rotulos.singular}`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="flex min-h-toque items-center gap-2 text-apoio text-texto-suave">
            <input
              type="checkbox"
              className="size-4 accent-[var(--mv-primaria)]"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
            />
            Mostrar {rotulos.plural} {rotulos.inativos}
          </label>
          <p role="status" className="ml-auto text-apoio text-texto-fraco">
            <span className="mv-numero text-texto">{quantidade(visiveis.length)}</span>{' '}
            {visiveis.length === 1 ? rotulos.singular : rotulos.plural}
          </p>
        </div>

        {erroDaLista && (
          <div className="border-b border-borda px-5 py-4">
            <Aviso tom="erro">{erroDaLista}</Aviso>
          </div>
        )}

        {carregando ? (
          <Carregando linhas={6} />
        ) : erro ? (
          <ErroDaConsulta erro={erro} aoTentar={aoTentarDeNovo} />
        ) : itens.length === 0 ? (
          <EstadoVazio
            icone={<Icone />}
            titulo={rotulos.nenhumCadastrado}
            acao={
              podeEditar && (
                <Botao tom="primario" onClick={() => setEditando({ item: null })}>
                  {rotulos.umNovo}
                </Botao>
              )
            }
          >
            {tipo === 'categoria'
              ? 'A categoria é como o estoque se agrupa no CMV: proteínas, mercearia, bebidas.'
              : 'O setor é o lugar onde se conta: bar, estoque geral, câmara fria, hortifrúti.'}
          </EstadoVazio>
        ) : visiveis.length === 0 ? (
          <EstadoVazio titulo="Nada encontrado com essa busca">
            A busca ignora acento e caixa.
          </EstadoVazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th className="w-12">Cor</Th>
                <Th>Nome</Th>
                <Th className="hidden sm:table-cell">Descrição</Th>
                <Th numerico>Produtos</Th>
                <Th className="w-28">Ordem</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => {
                const emUso = usos.get(item.id) ?? 0
                // A posicao que decide se da para subir ou descer e a da lista
                // COMPLETA, porque e nela que moverNaOrdem opera. Usar o indice
                // da lista filtrada desabilitava o "subir" da primeira linha
                // visivel mesmo quando havia item inativo acima dela.
                const posicao = ordenados.findIndex((o) => o.id === item.id)
                const fraco = contraste(item.cor, marca.cor_superficie) < CONTRASTE_MINIMO
                return (
                  <Linha
                    key={item.id}
                    aoClicar={() => setEditando({ item })}
                    className={item.ativo ? undefined : 'opacity-60'}
                  >
                    <Td>
                      <span
                        className="block size-5 rounded-marca-p border border-borda-forte"
                        style={{ backgroundColor: item.cor }}
                        title={fraco ? `${item.cor} — pouco contraste com o fundo` : item.cor}
                        aria-hidden
                      />
                    </Td>
                    <Td>
                      <span className="font-medium text-texto">{item.nome}</span>
                    </Td>
                    <Td className="hidden max-w-[22rem] sm:table-cell">
                      <span className="block truncate text-apoio text-texto-fraco">
                        {item.descricao ?? '—'}
                      </span>
                    </Td>
                    <Td numerico>
                      {emUso === 0 ? (
                        <span className="text-texto-fraco">0</span>
                      ) : (
                        quantidade(emUso)
                      )}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1">
                        <span className="mv-numero w-6 text-apoio text-texto-fraco">
                          {item.ordem}
                        </span>
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          disabled={!podeEditar || posicao <= 0 || busca !== ''}
                          aria-label={`Subir ${item.nome}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            aoReordenar(moverNaOrdem(ordenados, item.id, 'cima'))
                          }}
                        >
                          <ChevronUp className="size-4" aria-hidden />
                        </Botao>
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          disabled={!podeEditar || posicao === ordenados.length - 1 || busca !== ''}
                          aria-label={`Descer ${item.nome}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            aoReordenar(moverNaOrdem(ordenados, item.id, 'baixo'))
                          }}
                        >
                          <ChevronDown className="size-4" aria-hidden />
                        </Botao>
                      </span>
                    </Td>
                    <Td>
                      {item.ativo ? (
                        <Selo tom="sucesso">ativo</Selo>
                      ) : (
                        <Selo tom="neutro">inativo</Selo>
                      )}
                    </Td>
                  </Linha>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>

      {busca !== '' && podeEditar && (
        <p className="text-apoio text-texto-fraco">
          A ordem só pode ser mexida com a busca vazia — arrastar dentro de uma lista filtrada
          moveria o item para um lugar que você não está vendo.
        </p>
      )}

      {editando && (
        <FormularioDeCadastro
          key={editando.item?.id ?? 'novo'}
          tipo={tipo}
          item={editando.item}
          itens={itens}
          emUso={editando.item ? (usos.get(editando.item.id) ?? 0) : 0}
          proxima={proximaOrdem(itens)}
          podeEditar={podeEditar}
          salvando={salvando}
          erroDoServidor={erroDoServidor}
          aoSalvar={(dados) => aoSalvar(dados, () => setEditando(null))}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

/* ========================================================================== */
/* Formulário                                                                 */
/* ========================================================================== */

function FormularioDeCadastro({
  tipo,
  item,
  itens,
  emUso,
  proxima,
  podeEditar,
  salvando,
  erroDoServidor,
  aoSalvar,
  aoFechar,
}: {
  tipo: TipoDeCadastro
  item: ItemDeCadastro | null
  itens: readonly ItemDeCadastro[]
  emUso: number
  proxima: number
  podeEditar: boolean
  salvando: boolean
  erroDoServidor: string | null
  aoSalvar: (dados: Partial<Categoria> & { id?: string }) => void
  aoFechar: () => void
}): JSX.Element {
  const rotulos = ROTULOS[tipo]
  const { marca } = useMarca()
  const [rascunho, setRascunho] = useState<RascunhoDeCadastro>(() =>
    rascunhoDeCadastro(item, proxima),
  )
  const [tentou, setTentou] = useState(false)

  const problemas = useMemo(
    () => validarCadastro(rascunho, itens, tipo),
    [rascunho, itens, tipo],
  )
  const problemaDe = (campo: string) =>
    tentou ? problemas.find((p) => p.campo === campo)?.mensagem : undefined

  const vaiDesativar = item?.ativo === true && !rascunho.ativo
  const razao = contraste(rascunho.cor, marca.cor_superficie)

  // A prévia do seletor mede contra a superfície real do app, então o que a
  // pessoa lê ali é o contraste que o selo vai ter na tabela. `cor_secundaria`
  // é só o campo que este seletor edita na marca sintética — nenhuma cor de
  // categoria encosta na identidade do restaurante.
  const marcaDaPrevia = useMemo(
    () => ({ ...marca, cor_secundaria: rascunho.cor }),
    [marca, rascunho.cor],
  )

  function salvar() {
    setTentou(true)
    if (problemas.length > 0) return
    aoSalvar({
      ...(rascunho.id ? { id: rascunho.id } : {}),
      nome: rascunho.nome.trim(),
      descricao: rascunho.descricao.trim() === '' ? null : rascunho.descricao.trim(),
      cor: rascunho.cor.toUpperCase(),
      ordem: rascunho.ordem,
      ativo: rascunho.ativo,
    })
  }

  return (
    <PainelLateral
      aberto
      titulo={item ? item.nome : rotulos.umNovo}
      descricao={
        tipo === 'categoria'
          ? 'A categoria agrupa o produto no CMV e nos filtros.'
          : 'O setor é onde o produto é contado — e onde ele tem unidade e custo próprios.'
      }
      aoFechar={aoFechar}
      rodape={
        podeEditar ? (
          <>
            <Botao tom="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao
              tom="primario"
              carregando={salvando}
              onClick={salvar}
              icone={<Save className="size-4" aria-hidden />}
            >
              Salvar
            </Botao>
          </>
        ) : (
          <Botao tom="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
        )
      }
    >
      <fieldset disabled={!podeEditar} className="space-y-5">
        {erroDoServidor && (
          <Aviso tom="erro" titulo="O banco recusou o salvamento">
            {erroDoServidor}
          </Aviso>
        )}

        <div>
          <Rotulo para="cadastro-nome">Nome</Rotulo>
          <Campo
            id="cadastro-nome"
            className="mt-1.5"
            autoFocus
            value={rascunho.nome}
            aria-invalid={Boolean(problemaDe('nome'))}
            onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
          />
          {problemaDe('nome') && (
            <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
              {problemaDe('nome')}
            </p>
          )}
        </div>

        <div>
          <Rotulo para="cadastro-descricao">Descrição</Rotulo>
          <Campo
            id="cadastro-descricao"
            className="mt-1.5"
            placeholder="opcional"
            value={rascunho.descricao}
            onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
          />
        </div>

        <div>
          <SeletorDeCor
            rotulo="Cor"
            ajuda={
              tipo === 'categoria'
                ? 'Pinta o selo da categoria na tabela e a fatia dela no CMV.'
                : 'Pinta o selo do setor na tabela e no resumo da contagem.'
            }
            valor={rascunho.cor}
            aoMudar={(hex) => setRascunho((r) => ({ ...r, cor: hex }))}
            marca={marcaDaPrevia}
            campoDaMarca="cor_secundaria"
          />
          {razao < CONTRASTE_MINIMO && (
            <div className="mt-2">
              <Aviso tom="alerta">
                Esta cor tem {razao.toFixed(2).replace('.', ',')}:1 contra a superfície do sistema,
                abaixo dos 3:1 que AA pede para elemento gráfico. O selo vai existir, mas quem estiver
                de celular sob luz de cozinha não vai distinguir ele dos vizinhos. O nome continua
                escrito ao lado — cor nunca é a única informação aqui.
              </Aviso>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Rotulo para="cadastro-ordem">Ordem</Rotulo>
            <Campo
              id="cadastro-ordem"
              type="number"
              min={0}
              step={1}
              className="mv-numero mt-1.5 text-right"
              value={rascunho.ordem}
              onChange={(e) =>
                setRascunho((r) => ({ ...r, ordem: Number.parseInt(e.target.value, 10) || 0 }))
              }
            />
            {problemaDe('ordem') && (
              <p role="alert" className="mt-1.5 text-apoio text-erro-texto">
                {problemaDe('ordem')}
              </p>
            )}
            <p className="mt-1.5 text-micro text-texto-fraco">
              Define a sequência na folha de contagem. Menor vem primeiro.
            </p>
          </div>

          <label className="flex min-h-toque items-center gap-3 self-end">
            <input
              type="checkbox"
              className="size-4 accent-[var(--mv-primaria)]"
              checked={rascunho.ativo}
              onChange={(e) => setRascunho((r) => ({ ...r, ativo: e.target.checked }))}
            />
            <span className="text-corpo text-texto">Ativo</span>
          </label>
        </div>

        {vaiDesativar && (
          <Aviso tom="alerta" titulo={`Você está desativando ${rotulos.artigo} ${rotulos.singular}`}>
            <p className="mt-1">{avisoDeDesativacao(tipo, emUso)}</p>
          </Aviso>
        )}

        {item && emUso > 0 && !vaiDesativar && (
          <p className="text-apoio text-texto-fraco">
            <span className="mv-numero text-texto">{quantidade(emUso)}</span>{' '}
            {emUso === 1 ? 'produto ativo usa' : 'produtos ativos usam'} este cadastro hoje.
          </p>
        )}
      </fieldset>
    </PainelLateral>
  )
}
