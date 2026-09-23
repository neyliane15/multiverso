/**
 * Administração · Usuários — quem entra, com que papel, em qual restaurante.
 *
 * Duas honestidades moram nesta tela:
 *
 * 1. **A regra de papel aparece antes do clique.** O trigger `mv_guarda_papel`
 *    recusa um usuário mudar o próprio papel e recusa admin promover alguém a
 *    master. Aqui a opção vem desabilitada com o motivo escrito, em vez de um
 *    erro do Postgres depois. A regra mora em `logicaDeUsuarios.ts` e tem
 *    teste — o banco continua sendo a autoridade, a tela é só educada.
 *
 * 2. **O convite decide o papel, não o cadastro.** Até a migração 0008 o papel
 *    vinha de `raw_user_meta_data` — o `options.data` do `signUp()`, escolhido
 *    pelo navegador —, e quem se cadastrasse pedindo `master` virava master da
 *    rede. Agora o convite é gravado aqui, antes, por quem já tem o poder de
 *    dá-lo; quem se cadastra sem convite não ganha perfil e não enxerga nada.
 *
 *    Por isso o botão existe e não precisa da service role: a RLS de `convites`
 *    é que decide se este admin pode convidar para este restaurante.
 */
import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users as Icone,
} from 'lucide-react'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Campo,
  Carregando,
  Cartao,
  Dialogo,
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
import {
  useCancelarConvite,
  useConvidar,
  useConvites,
  useExcluirUsuario,
  useEquipe,
  useSalvarPerfil,
} from '@/dados/consultas'
import type { Convite } from '@/tipos/banco'
import { useSessao } from '@/dados/sessao'
import { dataHora, iniciais } from '@/util/formato'
import type { PapelUsuario, Perfil } from '@/tipos/banco'
import { PainelLateral } from '../PainelLateral'
import { podeExcluirUsuario } from './regraDeExclusao'
import {
  DESCRICAO_DO_PAPEL,
  FILTRO_DE_EQUIPE,
  avisoDeAutoAlteracao,
  filtrarEquipe,
  linkDoWhatsapp,
  mensagemDoConvite,
  telefoneLegivel,
  montarAlteracaoDePapel,
  motivoSemEdicao,
  opcoesDePapel,
  podeAlternarAtivo,
  podeEditarEquipe,
  type Envolvido,
  type FiltroDeEquipe,
} from './logicaDeUsuarios'

const TOM_DO_PAPEL: Record<PapelUsuario, 'marca' | 'info' | 'neutro'> = {
  master: 'marca',
  admin: 'info',
  gerente: 'neutro',
  operador: 'neutro',
}

function comoEnvolvido(p: Perfil): Envolvido {
  return { id: p.id, papel: p.papel, restaurante_id: p.restaurante_id }
}

export function Usuarios(): JSX.Element {
  const { perfil, restaurante, restaurantesVisiveis, ehMaster } = useSessao()
  const equipe = useEquipe(ehMaster ? null : (restaurante?.id ?? null))
  const salvar = useSalvarPerfil()

  const [filtro, setFiltro] = useState<FiltroDeEquipe>(FILTRO_DE_EQUIPE)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<Perfil | null>(null)
  const excluir = useExcluirUsuario(restaurante?.id ?? null)

  const ator = perfil ? comoEnvolvido(perfil) : null
  const podeEditar = podeEditarEquipe(ator)

  const lista = useMemo(() => equipe.data ?? [], [equipe.data])
  const visiveis = useMemo(() => filtrarEquipe(lista, filtro), [lista, filtro])

  const nomeDoRestaurante = useMemo(() => {
    const mapa = new Map(restaurantesVisiveis.map((r) => [r.id, r.nome]))
    return (id: string | null) => (id ? (mapa.get(id) ?? '—') : 'rede inteira')
  }, [restaurantesVisiveis])

  return (
    <>
      <CabecalhoDePagina
        titulo="Usuários"
        descricao="Quem entra no sistema, com que papel e em qual restaurante. O papel decide o que a pessoa enxerga e o que ela pode gravar."
      />

      {!podeEditar && (
        <Aviso tom="info" titulo="Você está só olhando">
          {motivoSemEdicao(ator)}
        </Aviso>
      )}

      <Cartao>
        <div className="grid gap-3 border-b border-borda px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco"
              aria-hidden
            />
            <Campo
              type="search"
              className="pl-9"
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar usuário"
              value={filtro.busca}
              onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
            />
          </div>

          {ehMaster && (
            <Selecao
              aria-label="Filtrar por restaurante"
              value={filtro.restauranteId ?? ''}
              onChange={(e) =>
                setFiltro((f) => ({
                  ...f,
                  restauranteId: e.target.value === '' ? null : e.target.value,
                }))
              }
            >
              <option value="">Todos os restaurantes</option>
              {restaurantesVisiveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          )}

          <Selecao
            aria-label="Filtrar por papel"
            value={filtro.papel ?? ''}
            onChange={(e) =>
              setFiltro((f) => ({
                ...f,
                papel: e.target.value === '' ? null : (e.target.value as PapelUsuario),
              }))
            }
          >
            <option value="">Todos os papéis</option>
            <option value="master">Master</option>
            <option value="admin">Admin</option>
            <option value="gerente">Gerente</option>
            <option value="operador">Operador</option>
          </Selecao>

          <Selecao
            aria-label="Mostrar usuários ativos ou inativos"
            value={filtro.situacao}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, situacao: e.target.value as FiltroDeEquipe['situacao'] }))
            }
          >
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
            <option value="todos">Ativos e inativos</option>
          </Selecao>
        </div>

        <div className="border-b border-borda px-5 py-3">
          <p role="status" className="text-apoio text-texto-fraco">
            <span className="mv-numero text-texto">{visiveis.length}</span>{' '}
            {visiveis.length === 1 ? 'usuário' : 'usuários'}
            {visiveis.length !== lista.length && <> de {lista.length}</>}
          </p>
        </div>

        {equipe.isPending ? (
          <Carregando linhas={5} />
        ) : equipe.isError ? (
          <ErroDaConsulta erro={equipe.error} aoTentar={() => void equipe.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio icone={<Icone />} titulo="Nenhum usuário ainda">
            Cada pessoa entra por um convite. Crie o primeiro no cartão abaixo: ela se cadastra com
            aquele e-mail e já nasce com o papel que você escolheu.
          </EstadoVazio>
        ) : visiveis.length === 0 ? (
          <EstadoVazio titulo="Ninguém com esses filtros">
            A busca ignora acento e caixa.
          </EstadoVazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Papel</Th>
                {ehMaster && <Th className="hidden md:table-cell">Restaurante</Th>}
                <Th className="hidden lg:table-cell">Último acesso</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <Linha
                  key={p.id}
                  aoClicar={() => setEditando(p)}
                  className={p.ativo ? undefined : 'opacity-60'}
                >
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className="mv-numero grid size-8 shrink-0 place-items-center rounded-full bg-primaria-24 text-micro font-semibold text-primaria-legivel">
                        {iniciais(p.nome)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-texto">
                          {p.nome}
                          {p.id === perfil?.id && (
                            <span className="ml-2 text-micro text-texto-fraco">(você)</span>
                          )}
                        </span>
                        <span className="block truncate text-micro text-texto-fraco">{p.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <Selo tom={TOM_DO_PAPEL[p.papel]}>{p.papel}</Selo>
                  </Td>
                  {ehMaster && (
                    <Td className="hidden md:table-cell">
                      <span className="text-apoio text-texto-suave">
                        {nomeDoRestaurante(p.restaurante_id)}
                      </span>
                    </Td>
                  )}
                  <Td className="hidden lg:table-cell">
                    <span className="mv-numero text-apoio text-texto-suave">
                      {p.ultimo_acesso_em ? dataHora(p.ultimo_acesso_em) : 'nunca entrou'}
                    </span>
                  </Td>
                  <Td>
                    {p.ativo ? <Selo tom="sucesso">ativo</Selo> : <Selo tom="erro">sem acesso</Selo>}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>

      <Convites
        restauranteId={ehMaster ? null : (restaurante?.id ?? null)}
        ehMaster={ehMaster}
        podeConvidar={podeEditar}
        restaurantes={restaurantesVisiveis.map((r) => ({ id: r.id, nome: r.nome }))}
        nomeDoRestaurante={nomeDoRestaurante}
      />

      {editando && (
        <FormularioDeUsuario
          key={editando.id}
          alvo={editando}
          ator={ator}
          ehMaster={ehMaster}
          restaurantes={restaurantesVisiveis.map((r) => ({ id: r.id, nome: r.nome }))}
          salvando={salvar.isPending}
          excluindo={excluir.isPending}
          erroDoServidor={
            salvar.error instanceof Error
              ? salvar.error.message
              : excluir.error instanceof Error
                ? excluir.error.message
                : null
          }
          aoSalvar={(patch) => salvar.mutate(patch, { onSuccess: () => setEditando(null) })}
          aoPedirExclusao={() => setConfirmandoExclusao(editando)}
          aoFechar={() => {
            setEditando(null)
            salvar.reset()
            excluir.reset()
          }}
        />
      )}

      {confirmandoExclusao && (
        <ConfirmarExclusao
          alvo={confirmandoExclusao}
          excluindo={excluir.isPending}
          aoConfirmar={() =>
            excluir.mutate(confirmandoExclusao.id, {
              onSuccess: () => {
                setConfirmandoExclusao(null)
                setEditando(null)
              },
            })
          }
          aoFechar={() => setConfirmandoExclusao(null)}
        />
      )}
    </>
  )
}

/* ========================================================================== */
/* Convites                                                                   */
/* ========================================================================== */

function Convites({
  restauranteId,
  ehMaster,
  podeConvidar,
  restaurantes,
  nomeDoRestaurante,
}: {
  restauranteId: string | null
  ehMaster: boolean
  podeConvidar: boolean
  restaurantes: { id: string; nome: string }[]
  nomeDoRestaurante: (id: string | null) => string
}): JSX.Element {
  const convites = useConvites(restauranteId)
  const convidar = useConvidar(restauranteId)
  const cancelar = useCancelarConvite()

  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [papel, setPapel] = useState<PapelUsuario>('operador')
  const [alvo, setAlvo] = useState(restaurantes[0]?.id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<Convite | null>(null)
  /** Qual convite pendente está com o recado aberto. */
  const [aberto, setAberto] = useState<string | null>(null)

  // O master convida para qualquer restaurante e é o único que cria master.
  const papeis: PapelUsuario[] = ehMaster
    ? ['master', 'admin', 'gerente', 'operador']
    : ['admin', 'gerente', 'operador']

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setFeito(null)
    try {
      const criado = await convidar.mutateAsync({
        email,
        papel,
        nome: nome.trim() || undefined,
        telefone: telefone.trim() || undefined,
        restauranteId: papel === 'master' ? undefined : ehMaster ? alvo : (restauranteId ?? undefined),
      })
      setFeito(criado)
      setEmail('')
      setNome('')
      setTelefone('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const pendentes = convites.data ?? []

  return (
    <Cartao
      titulo="Convites"
      descricao="Quem pode ser o quê é decidido aqui, antes do cadastro. Sem convite, quem se cadastra não enxerga nada. Com o WhatsApp preenchido, a tela abre a conversa com o recado pronto — o envio é seu."
    >
      {podeConvidar && (
        <form onSubmit={enviar} className="space-y-4 border-b border-borda p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Rotulo para="convite-email">E-mail</Rotulo>
              <Campo
                id="convite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@restaurante.com.br"
              />
            </div>
            <div className="space-y-1.5">
              <Rotulo para="convite-nome">Nome (opcional)</Rotulo>
              <Campo
                id="convite-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como aparece na tela"
              />
            </div>
            <div className="space-y-1.5">
              <Rotulo para="convite-telefone">WhatsApp (opcional)</Rotulo>
              <Campo
                id="convite-telefone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-8888"
                aria-describedby="ajuda-telefone"
              />
              <p id="ajuda-telefone" className="text-micro text-texto-fraco">
                {telefone.trim() === ''
                  ? 'Com o número, a tela abre a conversa com o recado pronto.'
                  : (telefoneLegivel(telefone) ??
                    'Número incompleto — confira o DDD.')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Rotulo para="convite-papel">Papel</Rotulo>
              <Selecao
                id="convite-papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelUsuario)}
              >
                {papeis.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Selecao>
            </div>
          </div>

          {/* Master escolhe o destino; para os demais, o destino é o próprio
              restaurante e escolha que não existe não vira campo. */}
          {ehMaster && papel !== 'master' && (
            <div className="space-y-1.5 sm:max-w-sm">
              <Rotulo para="convite-restaurante">Restaurante</Rotulo>
              <Selecao
                id="convite-restaurante"
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                required
              >
                {restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Selecao>
            </div>
          )}

          <p className="text-apoio text-texto-fraco">{DESCRICAO_DO_PAPEL[papel]}</p>

          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {feito && (
            <Aviso tom="sucesso" titulo="Convite criado — agora avise a pessoa">
              <p className="mt-1">
                {feito.telefone
                  ? 'O convite é uma permissão guardada aqui; nada sai sozinho. Abaixo, a conversa já escrita — confira e envie.'
                  : `Nada foi enviado por e-mail: o convite é uma permissão guardada aqui. Copie o recado e mande para ${feito.email} por onde vocês já se falam.`}
              </p>
              <RecadoDoConvite convite={feito} />
            </Aviso>
          )}

          <Botao
            type="submit"
            tom="primario"
            carregando={convidar.isPending}
            icone={<UserPlus className="size-4" aria-hidden />}
          >
            Criar convite
          </Botao>
        </form>
      )}

      {convites.isPending ? (
        <Carregando linhas={2} />
      ) : convites.isError ? (
        <ErroDaConsulta erro={convites.error} aoTentar={() => void convites.refetch()} />
      ) : pendentes.length === 0 ? (
        <EstadoVazio icone={<Mail />} titulo="Nenhum convite esperando">
          Convite aceito sai desta lista e a pessoa aparece na tabela acima.
        </EstadoVazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>E-mail</Th>
              <Th>Papel</Th>
              {ehMaster && <Th>Restaurante</Th>}
              <Th>Expira</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {pendentes.map((c: Convite) => {
              const vencido = new Date(c.expira_em).getTime() < Date.now()
              return (
                <Linha key={c.id}>
                  <Td>
                    <span className="font-medium text-texto">{c.email}</span>
                    {c.nome && <span className="block text-apoio text-texto-fraco">{c.nome}</span>}
                  </Td>
                  <Td>
                    <Selo tom={c.papel === 'master' ? 'alerta' : 'neutro'}>{c.papel}</Selo>
                  </Td>
                  {ehMaster && <Td>{nomeDoRestaurante(c.restaurante_id)}</Td>}
                  <Td>
                    {vencido ? (
                      <Selo tom="erro">vencido</Selo>
                    ) : (
                      <span className="text-texto-fraco">{dataHora(c.expira_em)}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {podeConvidar && (
                      <span className="inline-flex gap-1">
                        {/* O recado fica em CADA convite pendente, não só no
                            recém-criado: quem convidou ontem e não avisou
                            ninguém precisa dele hoje. */}
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          aria-expanded={aberto === c.id}
                          onClick={() => setAberto(aberto === c.id ? null : c.id)}
                        >
                          {aberto === c.id ? 'Fechar' : 'Ver recado'}
                        </Botao>
                        <Botao
                          tom="fantasma"
                          tamanho="p"
                          onClick={() => void cancelar.mutateAsync(c.id)}
                          aria-label={`Cancelar o convite de ${c.email}`}
                        >
                          Cancelar
                        </Botao>
                      </span>
                    )}
                  </Td>
                </Linha>
              )
            })}
          </tbody>
        </Tabela>
      )}

      {aberto !== null && (
        <div className="border-t border-borda p-5">
          {(() => {
            const c = pendentes.find((p: Convite) => p.id === aberto)
            if (!c) return null
            return (
              <>
                <p className="text-apoio leading-relaxed text-texto-suave">
                  Recado para <strong className="text-texto">{c.email}</strong>. O sistema não
                  envia nada sozinho — o convite é a permissão guardada aqui, e quem aperta enviar
                  é você.
                </p>
                <RecadoDoConvite convite={c} />
              </>
            )
          })()}
        </div>
      )}
    </Cartao>
  )
}

/* ========================================================================== */
/* Formulário                                                                 */
/* ========================================================================== */

function FormularioDeUsuario({
  alvo,
  ator,
  ehMaster,
  restaurantes,
  salvando,
  excluindo,
  erroDoServidor,
  aoSalvar,
  aoPedirExclusao,
  aoFechar,
}: {
  alvo: Perfil
  ator: Envolvido | null
  ehMaster: boolean
  restaurantes: readonly { id: string; nome: string }[]
  salvando: boolean
  excluindo: boolean
  erroDoServidor: string | null
  aoSalvar: (patch: Partial<Perfil> & { id: string }) => void
  aoPedirExclusao: () => void
  aoFechar: () => void
}): JSX.Element {
  const envolvido = comoEnvolvido(alvo)
  const [papel, setPapel] = useState<PapelUsuario>(alvo.papel)
  const [restauranteId, setRestauranteId] = useState<string | null>(alvo.restaurante_id)
  const [ativo, setAtivo] = useState(alvo.ativo)

  const opcoes = useMemo(() => opcoesDePapel(ator, envolvido), [ator, envolvido])
  const permissaoDoAtivo = podeAlternarAtivo(ator, envolvido)
  const permissaoDeExcluir = podeExcluirUsuario(ator, envolvido)
  const aviso = avisoDeAutoAlteracao(ator, envolvido, papel)

  const alteracao = useMemo(
    () => montarAlteracaoDePapel(ator, envolvido, papel, restauranteId),
    [ator, envolvido, papel, restauranteId],
  )

  const mudouPapel = papel !== alvo.papel || restauranteId !== alvo.restaurante_id
  const mudouAtivo = ativo !== alvo.ativo
  const precisaEscolherRestaurante = papel !== 'master' && !restauranteId

  function enviar() {
    const patch: Partial<Perfil> & { id: string } = { id: alvo.id }
    if (mudouPapel) {
      if (!alteracao.patch) return
      patch.papel = alteracao.patch.papel
      patch.restaurante_id = alteracao.patch.restaurante_id
    }
    if (mudouAtivo) patch.ativo = ativo
    aoSalvar(patch)
  }

  const nadaMudou = !mudouPapel && !mudouAtivo
  const bloqueado = mudouPapel && alteracao.patch === null

  return (
    <PainelLateral
      aberto
      titulo={alvo.nome}
      descricao={alvo.email}
      aoFechar={aoFechar}
      rodape={
        <>
          {permissaoDeExcluir.permitido && (
            <Botao
              tom="perigo"
              className="mr-auto"
              carregando={excluindo}
              onClick={() => aoPedirExclusao()}
              icone={<Trash2 className="size-4" aria-hidden />}
            >
              Excluir
            </Botao>
          )}
          <Botao tom="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            tom="primario"
            carregando={salvando}
            disabled={nadaMudou || bloqueado}
            onClick={enviar}
            icone={<Save className="size-4" aria-hidden />}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-6">
        {erroDoServidor && (
          <Aviso tom="erro" titulo="O banco recusou a alteração">
            {erroDoServidor}
          </Aviso>
        )}

        <section>
          <h3 className="font-titulo text-destaque font-semibold text-texto">Papel</h3>
          <p className="mt-1 text-apoio leading-relaxed text-texto-fraco">
            O papel decide o alcance da pessoa. As opções fechadas abaixo são as que o banco recusa —
            e o motivo está escrito em cada uma.
          </p>

          <ul className="mt-3 space-y-2">
            {opcoes.map((o) => {
              const escolhido = o.papel === papel
              return (
                <li key={o.papel}>
                  <label
                    className={[
                      'flex cursor-pointer items-start gap-3 rounded-marca border p-3 transition-colors',
                      escolhido ? 'border-primaria bg-primaria-06' : 'border-borda',
                      o.disponivel ? 'hover:border-borda-forte' : 'cursor-not-allowed opacity-70',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="papel"
                      className="sr-only"
                      checked={escolhido}
                      disabled={!o.disponivel}
                      onChange={() => setPapel(o.papel)}
                    />
                    <span
                      aria-hidden
                      className={[
                        'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                        escolhido ? 'border-primaria bg-primaria text-sobre-primaria' : 'border-borda-forte',
                      ].join(' ')}
                    >
                      {escolhido && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium capitalize text-texto">{o.papel}</span>
                      <span className="mt-0.5 block text-apoio leading-snug text-texto-fraco">
                        {DESCRICAO_DO_PAPEL[o.papel]}
                      </span>
                      {!o.disponivel && (
                        <span className="mt-1.5 block text-apoio text-alerta-texto">{o.motivo}</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        {papel !== 'master' && (ehMaster || precisaEscolherRestaurante) && (
          <div>
            <Rotulo para="usuario-restaurante">Restaurante</Rotulo>
            <Selecao
              id="usuario-restaurante"
              className="mt-1.5"
              value={restauranteId ?? ''}
              onChange={(e) => setRestauranteId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">Escolha um restaurante</option>
              {restaurantes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
            <p className="mt-1.5 text-micro text-texto-fraco">
              Só o master vive fora de um restaurante. Todos os outros papéis precisam de um — é um
              CHECK da tabela, não uma escolha da tela.
            </p>
          </div>
        )}

        {aviso && (
          <Aviso tom="alerta" titulo="Você está mexendo no próprio papel">
            <p className="mt-1">{aviso}</p>
          </Aviso>
        )}

        {bloqueado && alteracao.erro && (
          <Aviso tom="alerta" titulo="Falta um dado para salvar">
            <p className="mt-1">{alteracao.erro}</p>
          </Aviso>
        )}

        <section>
          <h3 className="font-titulo text-destaque font-semibold text-texto">Acesso</h3>
          <label
            className={[
              'mt-2 flex min-h-toque items-center gap-3',
              permissaoDoAtivo.permitido ? '' : 'opacity-70',
            ].join(' ')}
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--mv-primaria)]"
              checked={ativo}
              disabled={!permissaoDoAtivo.permitido}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-corpo text-texto">Pode entrar no sistema</span>
          </label>
          {!permissaoDoAtivo.permitido ? (
            <p className="mt-1.5 text-apoio text-alerta-texto">{permissaoDoAtivo.motivo}</p>
          ) : (
            <p className="mt-1.5 text-apoio text-texto-fraco">
              Desativar não apaga nada: o que a pessoa lançou continua no histórico, com o nome dela.
              Ela só deixa de conseguir entrar — e volta com um clique.
              {permissaoDeExcluir.permitido && ' Para tirar a conta de vez, use Excluir.'}
            </p>
          )}
          <p className="mt-3 text-apoio text-texto-fraco">
            Último acesso:{' '}
            <span className="mv-numero">
              {alvo.ultimo_acesso_em ? dataHora(alvo.ultimo_acesso_em) : 'nunca entrou'}
            </span>
          </p>
        </section>
      </div>
    </PainelLateral>
  )
}

/**
 * O recado pronto, com um botão para copiar.
 *
 * Existe porque o sistema não manda e-mail, e o buraco entre "convite criado"
 * e "a pessoa soube" era invisível: quem convidava ficava esperando um e-mail
 * que nunca sairia. Aqui o texto já vem escrito, com o endereço certo e os
 * quatro passos — inclusive o "Tenho um convite", que ninguém adivinha.
 */
function RecadoDoConvite({ convite }: { convite: Convite }): JSX.Element {
  const { restaurantesVisiveis } = useSessao()
  const [copiado, setCopiado] = useState(false)
  const [falhou, setFalhou] = useState(false)

  const restaurante =
    restaurantesVisiveis.find((r) => r.id === convite.restaurante_id)?.nome ?? null

  const texto = mensagemDoConvite({
    email: convite.email,
    nome: convite.nome,
    papel: convite.papel,
    restaurante,
    expiraEm: convite.expira_em,
    // O endereço real de onde o sistema está rodando: em produção é o
    // domínio da Vercel, e é esse que a pessoa precisa abrir.
    endereco: window.location.origin,
  })

  const whatsapp = linkDoWhatsapp(convite.telefone, texto)

  async function copiar() {
    setFalhou(false)
    try {
      // `navigator.clipboard` não existe fora de https (nem em alguns
      // navegadores antigos). Falhar em silêncio deixaria o botão mentindo.
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setFalhou(true)
    }
  }

  return (
    <div className="mt-3">
      <pre className="max-h-48 overflow-auto rounded-marca-p border border-borda bg-superficie px-3 py-2.5 text-apoio leading-relaxed whitespace-pre-wrap text-texto-suave">
        {texto}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {whatsapp !== null && (
          /* Link de verdade, e não um botão com onClick: o WhatsApp precisa
             abrir em aba nova, e o navegador trata link melhor do que
             `window.open` — que bloqueador de pop-up costuma engolir. */
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mv-toque inline-flex items-center gap-2 rounded-marca-p bg-primaria px-4 text-corpo font-medium text-sobre-primaria transition-[filter] hover:brightness-110 active:brightness-95"
          >
            <MessageCircle className="size-4" aria-hidden />
            Abrir no WhatsApp
          </a>
        )}
        <Botao
          tom={whatsapp === null || copiado ? 'secundario' : 'fantasma'}
          tamanho="p"
          onClick={() => void copiar()}
          icone={
            copiado ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )
          }
        >
          {copiado ? 'Copiado' : 'Copiar recado'}
        </Botao>
        {falhou && (
          <span className="text-micro text-texto-fraco">
            O navegador não deixou copiar. Selecione o texto acima e copie à mão.
          </span>
        )}
      </div>
      {whatsapp === null ? (
        <p className="mt-2 text-micro text-texto-fraco">
          {convite.telefone
            ? 'O número guardado não parece completo — edite o convite para corrigir.'
            : 'Sem WhatsApp neste convite: copie o recado e mande por onde preferir.'}
        </p>
      ) : (
        /* Dizer que o envio é com um toque evita a decepção seguinte: a tela
           abre a conversa escrita, quem manda é você. */
        <p className="mt-2 text-micro text-texto-fraco">
          Abre a conversa com <strong className="text-texto-suave">{telefoneLegivel(convite.telefone)}</strong>{' '}
          e o recado já escrito. Você confere e aperta enviar.
        </p>
      )}
    </div>
  )
}

/**
 * A confirmação da exclusão.
 *
 * Diz o que some e o que fica, com o nome de quem vai embora escrito, porque
 * "tem certeza?" não é aviso — é um obstáculo que se clica sem ler. O que se
 * perde de verdade é a autoria: contagens e notas continuam no histórico, mas
 * sem nome. É a diferença entre isto e desativar, e ela precisa estar à vista
 * ANTES do clique, não depois.
 */
function ConfirmarExclusao({
  alvo,
  excluindo,
  aoConfirmar,
  aoFechar,
}: {
  alvo: Perfil
  excluindo: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}): JSX.Element {
  return (
    <Dialogo
      titulo="Excluir esta conta?"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao tom="fantasma" onClick={aoFechar}>
            Não excluir
          </Botao>
          <Botao
            tom="perigo"
            carregando={excluindo}
            onClick={aoConfirmar}
            icone={<Trash2 className="size-4" aria-hidden />}
          >
            Excluir {alvo.nome}
          </Botao>
        </>
      }
    >
      <p className="text-corpo leading-relaxed text-texto-suave">
        <strong className="text-texto">{alvo.nome}</strong> ({alvo.email}) perde o acesso e a conta
        some do sistema. Não dá para desfazer.
      </p>

      <ul className="mt-3 space-y-1.5 text-apoio leading-relaxed text-texto-fraco">
        <li>
          <strong className="text-texto-suave">Fica:</strong> tudo que a pessoa lançou — contagens,
          notas, listas. Os números não mudam.
        </li>
        <li>
          <strong className="text-texto-suave">Some:</strong> o nome dela nesses registros. Onde
          hoje se lê quem contou, passará a não ter ninguém.
        </li>
        <li>
          <strong className="text-texto-suave">Libera:</strong> o e-mail, que pode receber um
          convite novo depois.
        </li>
      </ul>

      <p className="mt-3 text-apoio leading-relaxed text-texto-fraco">
        Se a ideia é só tirar o acesso e preservar o nome no histórico,
        <strong className="text-texto-suave"> desative</strong> em vez de excluir.
      </p>
    </Dialogo>
  )
}
