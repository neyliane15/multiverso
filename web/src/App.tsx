/**
 * Rotas e guarda de acesso.
 *
 * A tela só monta depois que a sessão carrega e o restaurante ativo é
 * conhecido — senão o app pintaria com a marca da plataforma e trocaria de cor
 * meio segundo depois, na cara de quem está usando.
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSessao } from '@/dados/sessao'
import { ProvedorDeMarca } from '@/tema/ProvedorDeMarca'
import { Casca } from '@/layout/Casca'
import { Logo } from '@/componentes/Logo'
import { Entrar } from '@/paginas/Entrar'
import { FalhaAoCarregar } from '@/paginas/FalhaAoCarregar'
import { NovaSenha } from '@/paginas/NovaSenha'
import { SemConvite } from '@/paginas/SemConvite'
import { Inicio } from '@/paginas/Inicio'
import { Rede } from '@/paginas/Rede'
import { Produtos } from '@/paginas/cadastros/Produtos'
import { Categorias } from '@/paginas/cadastros/Categorias'
import { Setores } from '@/paginas/cadastros/Setores'
import { Estoques } from '@/paginas/cadastros/Estoques'
import { Contagem } from '@/paginas/contagem/Contagem'
import { HistoricoDeContagens } from '@/paginas/contagem/Historico'
import { Notas } from '@/paginas/compras/Notas'
import { ListaDeCompras } from '@/paginas/compras/Lista'
import { HistoricoDeCompras } from '@/paginas/compras/Historico'
import { Fichas } from '@/paginas/fichas/Fichas'
import { DashboardCmv } from '@/paginas/cmv/Dashboard'
import { Restaurantes } from '@/paginas/admin/Restaurantes'
import { Usuarios } from '@/paginas/admin/Usuarios'
import { Identidade } from '@/paginas/admin/Identidade'

function Aguarde() {
  return (
    <div className="grid min-h-dvh place-items-center bg-fundo">
      <Logo className="h-8 animate-pulse" />
      <span className="sr-only">Carregando</span>
    </div>
  )
}

/** Rota que só o master abre. */
function SoMaster({ children }: { children: React.ReactNode }) {
  const { ehMaster } = useSessao()
  return ehMaster ? <>{children}</> : <Navigate to="/" replace />
}

/**
 * Rota de administração: equipe e identidade visual.
 *
 * Só master e admin. O gerente administra o **cadastro** (apaga produto,
 * categoria, setor), e é isso que `mv_pode_administrar` cobre — mas quem manda
 * na equipe e na marca é o admin, como a RLS de `perfis`, `restaurantes` e do
 * bucket `marcas` já exigia. Usar `podeAdministrar` aqui deixava o gerente
 * entrar para encontrar uma tela em leitura.
 */
function SoAdministracao({ children }: { children: React.ReactNode }) {
  const { perfil, ehMaster } = useSessao()
  return ehMaster || perfil?.papel === 'admin' ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  const { carregando, sessao, perfil, restaurante, ehMaster, recuperandoSenha, falhaAoCarregar } =
    useSessao()

  if (carregando) return <Aguarde />
  if (!sessao) return <Entrar />
  // Antes do perfil: quem veio do link de recuperação troca a senha primeiro,
  // mesmo que já tenha acesso a tudo.
  if (recuperandoSenha) return <NovaSenha />
  // A consulta falhou: dizer "você não tem convite" aqui seria mandar a pessoa
  // atrás de um problema que ela não tem.
  if (falhaAoCarregar !== null) return <FalhaAoCarregar />
  // Conta sem convite (ou com convite vencido). Era um spinner eterno.
  if (!perfil) return <SemConvite />

  // O master começa na visão da rede; quem vive num restaurante começa no
  // painel dele. Um master sem nenhum restaurante cadastrado ainda não tem o
  // que ver na tela de início.
  const inicio = ehMaster && !restaurante ? <Navigate to="/rede" replace /> : <Inicio />

  return (
    <ProvedorDeMarca restaurante={restaurante}>
      <Routes>
        <Route element={<Casca />}>
          <Route index element={inicio} />
          <Route path="rede" element={<SoMaster><Rede /></SoMaster>} />

          <Route path="cadastros/produtos" element={<Produtos />} />
          <Route path="cadastros/categorias" element={<Categorias />} />
          <Route path="cadastros/setores" element={<Setores />} />
          <Route path="cadastros/estoques" element={<Estoques />} />

          <Route path="contagem" element={<Contagem />} />
          <Route path="contagem/:contagemId" element={<Contagem />} />
          <Route path="contagem/historico" element={<HistoricoDeContagens />} />

          <Route path="compras/notas" element={<Notas />} />
          <Route path="compras/notas/:notaId" element={<Notas />} />
          <Route path="compras/lista" element={<ListaDeCompras />} />
          <Route path="compras/lista/:listaId" element={<ListaDeCompras />} />
          <Route path="compras/historico" element={<HistoricoDeCompras />} />

          <Route path="fichas" element={<Fichas />} />
          <Route path="cmv" element={<DashboardCmv />} />

          <Route path="admin/restaurantes" element={<SoMaster><Restaurantes /></SoMaster>} />
          <Route path="admin/usuarios" element={<SoAdministracao><Usuarios /></SoAdministracao>} />
          <Route path="admin/identidade" element={<SoAdministracao><Identidade /></SoAdministracao>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProvedorDeMarca>
  )
}
