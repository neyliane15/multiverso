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
        caminho: '/cadastros/insumos',
        rotulo: 'Insumos',
        icone: 'Package',
        descricao: 'O catálogo. Cada insumo tem uma categoria e vive em um ou mais setores.',
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
        caminho: '/contagem/dashboard',
        rotulo: 'Leitura da contagem',
        icone: 'ChartColumnBig',
        descricao:
          'Uma contagem lida de ponta a ponta: valor por categoria, onde está o capital parado e quem zerou.',
        exigeRestaurante: true,
      },
      {
        caminho: '/contagem/relatorio',
        rotulo: 'Relatório de contagem',
        icone: 'Scale',
        descricao:
          'Contagem anterior + compras − vendas: o consumo real contra o ideal, e a sugestão de compra.',
        exigeRestaurante: true,
      },
      {
        caminho: '/contagem/vendas',
        rotulo: 'Vendas',
        icone: 'Receipt',
        descricao: 'O que foi vendido no período, ficha por ficha. É o que o relatório enxerga.',
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

/**
 * As telas que o operador preso a setores enxerga — e são só estas.
 *
 * Ele entra para contar o setor dele e mais nada: cadastro, compras, CMV e
 * equipe não são assunto seu. Esconder o menu é conforto; o que de fato
 * tranca a porta é a RLS, porque endereço se digita na mão.
 */
export const ROTAS_DO_OPERADOR_DE_SETOR = ['/contagem', '/contagem/historico']

/**
 * O que, depois de `/contagem/`, é um id de contagem — e nada mais.
 *
 * Esta pergunta existe por causa de uma ambiguidade do endereço:
 * `/contagem/algo` pode ser o id de uma contagem — que o operador de setor
 * abre, porque é a folha dele — ou o nome de uma página da casa inteira, que
 * não é assunto dele. O guarda liberava o prefixo todo, e isso bastava
 * enquanto a única coisa depois de `/contagem/` era um uuid.
 *
 * Bastou nascerem `/contagem/dashboard`, `/contagem/relatorio` e
 * `/contagem/vendas` para o operador do bar poder ler o estoque, o consumo e a
 * venda da casa inteira digitando o endereço. A RLS continuaria recortando o
 * que ele enxerga — e é justamente esse o problema: ele veria um dashboard com
 * o total de um setor só, com cara de total da casa.
 *
 * A primeira versão deste guarda era uma lista NEGRA dos nomes das páginas, e
 * ela tinha dois furos de forma, não de conteúdo:
 *
 *   1. O React Router casa rota sem olhar maiúscula (`caseSensitive` é falso
 *      por omissão). `/contagem/Dashboard` abre a MESMA tela que
 *      `/contagem/dashboard` — e a lista negra, comparando texto cru, dizia
 *      "este não é o nome de nenhuma página, deve ser um id" e liberava.
 *      Medido com `matchRoutes` de verdade: `/contagem/Dashboard` casa
 *      `/contagem/dashboard` e a lista negra respondia `true`.
 *   2. Página nova nasce liberada. Quem acrescentar `/contagem/compras` amanhã
 *      precisa lembrar de vir aqui, e esquecer não dá erro nenhum.
 *
 * Lista BRANCA resolve os dois: o que passa é o que tem CARA DE ID, e todo o
 * resto é negado por não ser id. Todos os links da casa para a folha de uma
 * contagem usam `contagens.id`, que é uuid — então a forma é conhecida.
 */
const PARECE_ID_DE_CONTAGEM =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O endereço como o ROTEADOR o lê, e não como ele foi digitado.
 *
 * O furo da lista negra era este desencontro: o React Router casa rota sem
 * olhar maiúscula, e o guarda comparava texto cru. A lista branca fechou o
 * lado perigoso — `/contagem/Dashboard` passou a ser barrado — mas deixou o
 * outro lado torto, e ele também é desencontro. Medido com `matchRoutes` de
 * verdade, nesta árvore, em 35 formas de endereço:
 *
 *   /contagem/historico/   → o roteador abre o HISTÓRICO, o guarda barrava
 *   /contagem/Historico    → o roteador abre o HISTÓRICO, o guarda barrava
 *   /contagem/<uuid>/      → o roteador abre a FOLHA dele, o guarda barrava
 *
 * Nenhum deles é furo — todos erram para o lado de negar —, mas são a porta
 * do próprio operador batendo na cara dele por causa de uma barra no fim de
 * um link colado. Normalizar aqui é seguro justamente porque a lista é
 * BRANCA: tirar barra e caixa não transforma nome de página em id.
 */
function comoORoteadorLe(caminho: string): string {
  const semBarraNoFim = caminho.replace(/\/+$/, '')
  return (semBarraNoFim === '' ? '/' : semBarraNoFim).toLowerCase()
}

export function menuVisivel(
  papel: PapelUsuario | null,
  temRestaurante: boolean,
  restritoASetores = false,
): Modulo[] {
  if (!papel) return []
  return MODULOS.map((m) => ({
    ...m,
    itens: m.itens.filter(
      (i) =>
        (!i.papeis || i.papeis.includes(papel)) &&
        (!i.exigeRestaurante || temRestaurante) &&
        (!restritoASetores || ROTAS_DO_OPERADOR_DE_SETOR.includes(i.caminho)),
    ),
  })).filter((m) => m.itens.length > 0)
}

/** Este endereço é permitido para quem só conta um setor? */
export function rotaPermitidaNoSetor(caminho: string): boolean {
  const endereco = comoORoteadorLe(caminho)
  if (ROTAS_DO_OPERADOR_DE_SETOR.includes(endereco)) return true
  // Sobra um caso: `/contagem/<id>`, a folha de uma contagem específica. Ela
  // passa — mas só quando o que vem depois da barra é um id, e não o nome de
  // uma das páginas da casa.
  if (!endereco.startsWith('/contagem/')) return false
  const resto = endereco.slice('/contagem/'.length)
  if (resto === '' || resto.includes('/')) return false
  return PARECE_ID_DE_CONTAGEM.test(resto)
}

/** Todos os caminhos, para o guarda de rota e a busca por comando. */
export const TODAS_AS_ROTAS: ItemDeMenu[] = MODULOS.flatMap((m) => m.itens)
