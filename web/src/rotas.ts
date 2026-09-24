/**
 * Mapa de navegação: a fonte única dos módulos do sistema.
 *
 * A barra lateral, a busca por comando e o guarda de permissão leem daqui.
 * Módulo novo entra nesta lista — e aparece nos três lugares de uma vez.
 */
import type { PapelUsuario } from '@/tipos/banco'

export interface ItemDeMenu {
  /** Caminho da rota, sempre em português. */
  caminho: string
  rotulo: string
  /** Nome do ícone em lucide-react. */
  icone: string
  descricao: string
  /** Papéis que enxergam o item. Vazio = todos os autenticados. */
  papeis?: PapelUsuario[]
  /** Só faz sentido com um restaurante ativo. */
  exigeRestaurante?: boolean
}

export interface Modulo {
  numero: string
  rotulo: string
  itens: ItemDeMenu[]
}

export const MODULOS: Modulo[] = [
  {
    numero: '0',
    rotulo: 'Visão geral',
    itens: [
      {
        caminho: '/',
        rotulo: 'Início',
        icone: 'LayoutDashboard',
        descricao: 'O estado do restaurante hoje: estoque, contagem aberta e compras do mês.',
        exigeRestaurante: true,
      },
      {
        caminho: '/rede',
        rotulo: 'Rede',
        icone: 'Network',
        descricao: 'Todos os restaurantes do sistema, com estoque e último acesso.',
        papeis: ['master'],
      },
    ],
  },
  {
    numero: '1',
    rotulo: 'Cadastros',
    itens: [
      {
        caminho: '/cadastros/produtos',
        rotulo: 'Produtos',
        icone: 'Package',
        descricao: 'O catálogo. Cada produto tem uma categoria e vive em um ou mais setores.',
        exigeRestaurante: true,
      },
      {
        caminho: '/cadastros/categorias',
        rotulo: 'Categorias',
        icone: 'Tags',
        descricao: 'Como o estoque se agrupa no CMV: proteínas, mercearia, bebidas...',
        exigeRestaurante: true,
      },
      {
        caminho: '/cadastros/setores',
        rotulo: 'Setores',
        icone: 'Boxes',
        descricao: 'Onde se conta: bar, estoque geral, câmara fria, hortifrúti.',
        exigeRestaurante: true,
      },
      {
        caminho: '/cadastros/estoques',
        rotulo: 'Estoques de setor',
        icone: 'Refrigerator',
        descricao: 'Onde, dentro do setor: Bar › Geladeira 1, Bar › Prateleira do fundo.',
        exigeRestaurante: true,
      },
    ],
  },
  {
    numero: '2',
    rotulo: 'Contagem',
    itens: [
      {
        caminho: '/contagem',
        rotulo: 'Contagem',
        icone: 'ClipboardList',
        descricao: 'A folha de contagem, setor por setor, com o total subindo em tempo real.',
        exigeRestaurante: true,
      },
      {
        caminho: '/contagem/historico',
        rotulo: 'Histórico',
        icone: 'History',
        descricao: 'Todas as contagens fechadas e a variação entre elas.',
        exigeRestaurante: true,
      },
    ],
  },
  {
    numero: '3',
    rotulo: 'Compras',
    itens: [
      {
        caminho: '/compras/notas',
        rotulo: 'Notas fiscais',
        icone: 'FileText',
        descricao: 'Importe o XML ou o PDF da nota — ou lance a compra de rua na mão.',
        exigeRestaurante: true,
      },
      {
        caminho: '/compras/lista',
        rotulo: 'Lista de compras',
        icone: 'ShoppingCart',
        descricao: 'O cadastro inteiro virando folha de pedido, com sugestão de quantidade.',
        exigeRestaurante: true,
      },
      {
        caminho: '/compras/historico',
        rotulo: 'Histórico',
        icone: 'Receipt',
        descricao: 'Tudo que entrou, por período e por fornecedor.',
        exigeRestaurante: true,
      },
    ],
  },
  {
    numero: '4',
    rotulo: 'Fichas técnicas',
    itens: [
      {
        caminho: '/fichas',
        rotulo: 'Fichas técnicas',
        icone: 'ChefHat',
        descricao: 'A receita de cada item do cardápio, com o custo vindo do catálogo e o CMV do prato.',
        exigeRestaurante: true,
      },
    ],
  },
  {
    numero: '5',
    rotulo: 'CMV',
    itens: [
      {
        caminho: '/cmv',
        rotulo: 'Dashboard CMV',
        icone: 'TrendingUp',
        descricao: 'Estoque inicial, compras e estoque final — semanal e mensal.',
        exigeRestaurante: true,
      },
    ],
  },
  {
    numero: '9',
    rotulo: 'Administração',
    itens: [
      {
        caminho: '/admin/restaurantes',
        rotulo: 'Restaurantes',
        icone: 'Store',
        descricao: 'Cadastro dos clientes do sistema e a marca de cada um.',
        papeis: ['master'],
      },
      {
        caminho: '/admin/usuarios',
        rotulo: 'Usuários',
        icone: 'Users',
        descricao: 'Quem entra, com que papel, em qual restaurante.',
        papeis: ['master', 'admin'],
      },
      {
        caminho: '/admin/identidade',
        rotulo: 'Identidade visual',
        icone: 'Palette',
        descricao: 'Logomarca, cores e fontes deste restaurante.',
        papeis: ['master', 'admin'],
        exigeRestaurante: true,
      },
    ],
  },
]

export function menuVisivel(
  papel: PapelUsuario | null,
  temRestaurante: boolean,
): Modulo[] {
  if (!papel) return []
  return MODULOS.map((m) => ({
    ...m,
    itens: m.itens.filter(
      (i) =>
        (!i.papeis || i.papeis.includes(papel)) &&
        (!i.exigeRestaurante || temRestaurante),
    ),
  })).filter((m) => m.itens.length > 0)
}

/** Todos os caminhos, para o guarda de rota e a busca por comando. */
export const TODAS_AS_ROTAS: ItemDeMenu[] = MODULOS.flatMap((m) => m.itens)
