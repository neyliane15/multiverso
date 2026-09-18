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
 * 2. **Convite não tem botão.** `auth.admin.inviteUserByEmail` exige a service
 *    role, que não pode viver no navegador: qualquer pessoa com o DevTools
 *    aberto viraria dona do projeto. Então a tela mostra o caminho real pelo
 *    painel do Supabase e diz o que falta construir. Botão que não funciona é
 *    pior que instrução que funciona.
 */
import { useMemo, useState } from 'react'
import { Check, Info, Mail, Save, Search, Users as Icone } from 'lucide-react'
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
import { useEquipe, useSalvarPerfil } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { dataHora, iniciais } from '@/util/formato'
import type { PapelUsuario, Perfil } from '@/tipos/banco'
import { PainelLateral } from '../PainelLateral'
import {
  DESCRICAO_DO_PAPEL,
  FILTRO_DE_EQUIPE,
  avisoDeAutoAlteracao,
  filtrarEquipe,
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
            O primeiro acesso de cada pessoa nasce de um convite feito no painel do Supabase — as
            instruções estão logo abaixo.
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

      <ComoConvidar />

      {editando && (
        <FormularioDeUsuario
          key={editando.id}
          alvo={editando}
          ator={ator}
          ehMaster={ehMaster}
          restaurantes={restaurantesVisiveis.map((r) => ({ id: r.id, nome: r.nome }))}
          salvando={salvar.isPending}
          erroDoServidor={salvar.error instanceof Error ? salvar.error.message : null}
          aoSalvar={(patch) => salvar.mutate(patch, { onSuccess: () => setEditando(null) })}
          aoFechar={() => {
            setEditando(null)
            salvar.reset()
          }}
        />
      )}
    </>
  )
}

/* ========================================================================== */
/* Convite                                                                    */
/* ========================================================================== */

function ComoConvidar(): JSX.Element {
  return (
    <Cartao
      titulo="Como entra um usuário novo"
      descricao="Ainda não dá para convidar por aqui — e o motivo é de segurança, não de preguiça."
    >
      <div className="space-y-4 p-5">
        <Aviso tom="info" titulo="Por que não existe um botão “Convidar”">
          <p className="mt-1">
            <span>
              Criar usuário no Supabase é <code className="mv-numero">auth.admin</code>, e{' '}
              <code className="mv-numero">auth.admin</code> só funciona com a chave{' '}
              <em>service role</em>. Essa chave ignora toda a RLS: colocá-la no navegador entregaria o
              banco inteiro a quem abrisse o inspecionar do Chrome. Por isso o convite não pode
              nascer desta tela.
            </span>
          </p>
        </Aviso>

        <div>
          <h3 className="font-titulo text-corpo font-semibold text-texto">
            O caminho que funciona hoje
          </h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-apoio leading-relaxed text-texto-suave">
            <li>
              No painel do Supabase, abra <strong>Authentication → Users → Invite user</strong> e
              informe o e-mail da pessoa.
            </li>
            <li>
              Em <strong>User metadata</strong>, preencha exatamente estas três chaves:
              <ul className="mt-1.5 space-y-1">
                <li>
                  <code className="mv-numero text-texto">nome</code> — o nome que aparece na tela.
                </li>
                <li>
                  <code className="mv-numero text-texto">papel</code> —{' '}
                  <code className="mv-numero">admin</code>, <code className="mv-numero">gerente</code>{' '}
                  ou <code className="mv-numero">operador</code>. Sem isso a pessoa entra como
                  operador.
                </li>
                <li>
                  <code className="mv-numero text-texto">restaurante_id</code> — o id do restaurante.
                  Obrigatório para todo papel que não seja master; o master vai sem ele.
                </li>
              </ul>
            </li>
            <li>
              O gatilho <code className="mv-numero">mv_ao_criar_usuario</code> lê esses metadados e
              cria o perfil correspondente em <code className="mv-numero">perfis</code>. A pessoa
              aparece nesta lista assim que aceitar o convite.
            </li>
            <li>Se algum metadado vier errado, corrija o papel e o restaurante aqui mesmo.</li>
          </ol>
        </div>

        <p className="flex gap-2 text-apoio text-texto-fraco">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-texto-suave">O que falta construir:</strong> uma Edge Function
            que guarde a service role no servidor e exponha um convite com permissão checada — o
            admin convidando só para o próprio restaurante, o master para qualquer um. Enquanto ela
            não existe, esta tela prefere dizer a verdade a oferecer um botão que falharia.
          </span>
        </p>

        <p className="flex items-center gap-2 text-apoio text-texto-fraco">
          <Mail className="size-4 shrink-0" aria-hidden />
          O convite chega por e-mail; até a pessoa aceitar, ela não existe em{' '}
          <code className="mv-numero">perfis</code>.
        </p>
      </div>
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
  erroDoServidor,
  aoSalvar,
  aoFechar,
}: {
  alvo: Perfil
  ator: Envolvido | null
  ehMaster: boolean
  restaurantes: readonly { id: string; nome: string }[]
  salvando: boolean
  erroDoServidor: string | null
  aoSalvar: (patch: Partial<Perfil> & { id: string }) => void
  aoFechar: () => void
}): JSX.Element {
  const envolvido = comoEnvolvido(alvo)
  const [papel, setPapel] = useState<PapelUsuario>(alvo.papel)
  const [restauranteId, setRestauranteId] = useState<string | null>(alvo.restaurante_id)
  const [ativo, setAtivo] = useState(alvo.ativo)

  const opcoes = useMemo(() => opcoesDePapel(ator, envolvido), [ator, envolvido])
  const permissaoDoAtivo = podeAlternarAtivo(ator, envolvido)
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
              Ela só deixa de conseguir entrar.
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
