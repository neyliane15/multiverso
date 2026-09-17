import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProvedorDeSessao } from './dados/sessao'
import './estilos.css'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // Contagem e compras não mudam sozinhas a cada segundo; recarregar ao
      // trocar de aba só gasta rede e faz a tabela piscar na cara de quem conta.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
