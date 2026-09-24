/**
 * A visão do master: todos os restaurantes do sistema numa tela só.
 *
 * Esta é a única tela do sistema que mostra **vários restaurantes ao mesmo
 * tempo**, e por isso é a exceção prevista na IDENTIDADE: a cor de cada cartão
 * vem do banco, por props, para o `style` — nunca escrita no código. O resto
 * continua em token.
 *
 * A leitura que o master abre esta tela para fazer é uma só: quem parou de
 * contar. Cliente que não conta é cliente saindo, então a lista sobe pelo
 * risco e o cartão diz o motivo, não só a data.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Clock, Network, Package, Users } from 'lucide-react'
import {
  Aviso,
  Botao,
  CabecalhoDePagina,
  Carregando,
  Cartao,
  ErroDaConsulta,
  EstadoVazio,
  Selecao,
  Selo,
} from '@/componentes/base'
import { LogoDoRestaurante } from '@/componentes/LogoDoRestaurante'
import { usePanorama } from '@/dados/consultas'
import { useSessao } from '@/dados/sessao'
import { data as formatarData, dataHora, dinheiro, quantidade } from '@/util/formato'
import type { PanoramaRestaurante } from '@/tipos/banco'
import { marcaDoPanorama } from './marcaDoPanorama'
import {
  avaliarRisco,
  dataIso,
  ordenarPanorama,
  type CriterioDoPanorama,
  type NivelDeRisco,
} from './logicaDoPainel'

const TOM_DO_RISCO: Record<NivelDeRisco, 'sucesso' | 'alerta' | 'erro' | 'info' | 'neutro'> = {
  ok: 'sucesso',
  atencao: 'alerta',
  critico: 'erro',
  novo: 'info',
  inativo: 'neutro',
}

const ROTULO_DO_RISCO: Record<NivelDeRisco, string> = {
  ok: 'em dia',
  atencao: 'atrasado',
  critico: 'abandonando',
  novo: 'recém-cadastrado',
  inativo: 'desativado',
}

function Numero({
  icone,
  valor,
  rotulo,
}: {
  icone: JSX.Element
  valor: number
  rotulo: string
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-micro text-texto-fraco">
        {icone}
        {rotulo}
      </div>
      <div className="mv-numero mt-0.5 text-corpo font-semibold text-texto">
        {quantidade(valor)}
      </div>
    </div>
  )
}

export function Rede(): JSX.Element {
  const panorama = usePanorama()
  const { restaurante, trocarRestaurante } = useSessao()
  const navegar = useNavigate()
  const [criterio, setCriterio] = useState<CriterioDoPanorama>('risco')

  const hoje = dataIso()
  const lista = useMemo(
    () => ordenarPanorama(panorama.data ?? [], criterio, hoje),
    [panorama.data, criterio, hoje],
  )

  const emRisco = useMemo(
    () => lista.filter((r) => avaliarRisco(r, hoje).nivel === 'critico').length,
    [lista, hoje],
  )

  function abrir(r: PanoramaRestaurante) {
    trocarRestaurante(r.id)
    navegar('/')
  }

  return (
    <>
      <CabecalhoDePagina
        titulo="Rede"
        descricao="Todos os restaurantes do sistema. Clicar em um cartão põe aquele restaurante em foco e abre o painel dele."
        acoes={
          <Selecao
            aria-label="Ordenar os restaurantes"
            className="w-56"
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as CriterioDoPanorama)}
          >
            <option value="risco">Quem está sem contar primeiro</option>
            <option value="nome">Por nome</option>
            <option value="estoque">Por valor de estoque</option>
          </Selecao>
        }
      />

      {panorama.isPending ? (
        <Cartao>
          <Carregando linhas={5} />
        </Cartao>
      ) : panorama.isError ? (
        <Cartao>
          <ErroDaConsulta erro={panorama.error} aoTentar={() => void panorama.refetch()} />
        </Cartao>
      ) : lista.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Network />}
            titulo="Nenhum restaurante na rede"
            acao={
              <Botao tom="primario" onClick={() => navegar('/admin/restaurantes')}>
                Cadastrar o primeiro
              </Botao>
            }
          >
            Cadastre um restaurante e depois monte a identidade visual dele — é o caminho de entrada
            de todo cliente novo.
          </EstadoVazio>
        </Cartao>
      ) : (
        <>
          {emRisco > 0 && (
            <Aviso tom="alerta" titulo="Restaurantes sem contar há mais de um mês">
              <p className="mt-1">
                <span className="mv-numero">{quantidade(emRisco)}</span>{' '}
                {emRisco === 1 ? 'restaurante está' : 'restaurantes estão'} sem fechar contagem há
                mais de 30 dias. Sem estoque final não existe CMV — é o primeiro sinal de cliente
                largando o sistema.
              </p>
            </Aviso>
          )}

          <p role="status" className="text-apoio text-texto-fraco">
            <span className="mv-numero text-texto">{quantidade(lista.length)}</span>{' '}
            {lista.length === 1 ? 'restaurante' : 'restaurantes'} na rede.
          </p>

          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((r) => {
              const risco = avaliarRisco(r, hoje)
              const marca = marcaDoPanorama(r.cor_primaria, r.logo_url)
              const emFoco = restaurante?.id === r.id
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => abrir(r)}
                    aria-label={`Pôr ${r.nome} em foco e abrir o painel`}
                    className={[
                      'flex h-full w-full flex-col gap-4 rounded-marca border bg-superficie-1 p-4 text-left',
                      'transition-colors hover:border-borda-forte hover:bg-primaria-06 active:bg-primaria-16',
                      emFoco ? 'border-primaria' : 'border-borda',
                      r.ativo ? '' : 'opacity-70',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <LogoDoRestaurante
                        nome={r.nome}
                        logoUrl={r.logo_url}
                        marca={marca}
                        tamanho={44}
                        decorativo
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-titulo text-destaque font-semibold text-texto">
                            {r.nome}
                          </h3>
                          {emFoco && <Selo tom="marca">em foco</Selo>}
                        </div>
                        <p className="truncate text-apoio text-texto-fraco">
                          {r.unidade ? `${r.unidade} · ` : ''}
                          {r.slug}
                        </p>
                      </div>
                      {/* A cor do restaurante como fio vertical: sinal de
                          identidade, com o nome sempre ao lado. */}
                      <span
                        aria-hidden
                        className="h-10 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: r.cor_primaria }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Selo tom={TOM_DO_RISCO[risco.nivel]}>{ROTULO_DO_RISCO[risco.nivel]}</Selo>
                      <span className="text-apoio text-texto-suave">{risco.motivo}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t border-borda pt-3">
                      <Numero
                        icone={<Users className="size-3.5" aria-hidden />}
                        valor={r.usuarios}
                        rotulo="usuários"
                      />
                      <Numero
                        icone={<Package className="size-3.5" aria-hidden />}
                        valor={r.produtos}
                        rotulo="insumos"
                      />
                      <Numero
                        icone={<Boxes className="size-3.5" aria-hidden />}
                        valor={r.setores}
                        rotulo="setores"
                      />
                    </div>

                    <div className="grid gap-2 border-t border-borda pt-3 text-apoio">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-texto-fraco">Valor do estoque</span>
                        <span className="mv-numero font-semibold text-texto">
                          {r.valor_estoque === null ? '—' : dinheiro(r.valor_estoque)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-texto-fraco">Última contagem</span>
                        <span className="mv-numero text-texto-suave">
                          {r.ultima_contagem ? formatarData(r.ultima_contagem) : 'nenhuma'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-texto-fraco">
                          <Clock className="size-3.5" aria-hidden />
                          Último acesso
                        </span>
                        <span className="mv-numero text-texto-suave">
                          {r.ultimo_acesso ? dataHora(r.ultimo_acesso) : 'nunca entrou'}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
