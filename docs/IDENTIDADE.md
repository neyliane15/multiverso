# Identidade do Multiverso

Documento de uma página. Vale para todo componente novo. Se a direção mudar,
corrija **aqui primeiro** e depois no código.

## A ideia: aço e etiqueta

O Multiverso não é um painel de apresentação, é uma ferramenta de turno. Alguém
conta estoque de celular dentro de uma câmara fria, de luva, com pressa. O
gerente confere nota fiscal linha a linha. O dono abre o CMV e quer saber em
três segundos se fechou.

Então a tela é um **painel de instrumento**: superfície fria de aço, o número em
primeiro plano, e cor usada como **sinal** — nunca como enfeite. O que sobra de
personalidade vem de três lugares, e só deles:

1. **A marca do restaurante**, que pinta a ação principal, a seleção e a
   primeira série dos gráficos.
2. **A tipografia numérica**, porque quase tudo aqui é número em coluna.
3. **A logomarca**, duas órbitas cruzadas e um núcleo cheio: vários mundos —
   vários restaurantes — girando num sistema só.

O risco que assumimos de propósito: as **superfícies elevadas levam um fio da
cor primária dentro** (2% por degrau, misturado em OKLab). Mesmo o cinza do app
é do restaurante. É contido e calculado, e nenhum componente precisa saber
disso — sai pronto em `--mv-superficie-1/2/3`.

## Tipografia

Três papéis, três faces. O restaurante escolhe as duas primeiras; a terceira é
do sistema e não se mexe.

| Papel | Padrão | Onde |
|---|---|---|
| Título (`--mv-fonte-titulo`) | Sora | título de tela, de seção, de cartão |
| Texto (`--mv-fonte-texto`) | Inter | leitura, campo, célula de tabela |
| Número (`--mv-fonte-numero`) | JetBrains Mono | **fixa** — todo valor que entra em coluna |

Todo número que o olho precisa comparar de cima a baixo usa a classe
`.mv-numero`: face numérica, `tabular-nums` e zero cortado. Se a coluna não
alinha, ninguém confere.

Escala fixa, do sistema — não é da marca. Nada acima de 32px, porque aqui não
existe capa, existe cabeçalho de tela.

| Token | px | Uso |
|---|---|---|
| `text-micro` | 11 | rótulo de eixo, unidade, carimbo |
| `text-rotulo` | 12 | rótulo de campo, cabeçalho de tabela (`.mv-rotulo`, caixa alta) |
| `text-apoio` | 13 | texto secundário, ajuda, aviso |
| `text-corpo` | 15 | leitura, célula de tabela |
| `text-destaque` | 18 | título de cartão |
| `text-secao` | 22 | título de seção |
| `text-tela` | 28 | título de tela |
| `text-numero` | 32 | o número que a tela existe para dar |

## Cor

Três camadas, e elas não se misturam.

**1. Marca — vem do banco, muda por restaurante.**
`--mv-primaria` é a ação: o botão que fecha a contagem, a linha selecionada, a
série 1 do gráfico. `--mv-acento` é o segundo sinal: foco, destaque de atenção
que não é erro. `--mv-secundaria` é estrutural: fundo de cabeçalho, diagonal do
monograma. Se primária e acento ficam parecidas, o sistema perde um sinal —
`validarMarca` avisa.

**2. Neutros — fixos, do sistema.** Escala própria de grafite frio (matiz 248,
croma baixíssimo), não o cinza genérico do Tailwind: é o aço de cozinha sob luz
fria. `--mv-neutro-0` a `--mv-neutro-1000`.

**3. Estados — fixos, do sistema, e não negociáveis.** `sucesso`, `alerta`,
`erro`, `informacao`, cada um com `-texto` (AA), `-suave` (faixa de fundo) e
`-borda`. Um alerta vermelho não vira rosa porque o cliente escolheu rosa. Os
valores de tema claro e de tema escuro foram **escolhidos**, não invertidos.

**Gráficos.** `paletaDeGraficos()` devolve oito cores em ordem fixa. O slot 1
carrega a matiz do restaurante; os outros sete são âncoras fixas, com
luminosidade alternando claro/escuro — é a diferença de luminosidade que
sobrevive à protanopia e à deuteranopia. O conjunto foi conferido com o
validador da skill `dataviz` (banda de L, piso de croma, ΔE de CVD entre
vizinhos, piso de visão normal e contraste contra a superfície), nos dois temas.

Três regras que vêm junto:

- **A ordem nunca é reciclada.** A nona série vira "Outros", nunca uma nona cor.
- **Cor segue a entidade, não o ranking.** Filtrar não pode repintar quem ficou.
- **Duas séries ou mais pedem legenda**, sempre, e rótulo direto em até quatro.
  Identidade nunca é só a cor. Algumas cores ficam entre 2,85:1 e 3:1 contra a
  superfície: por isso rótulo visível ou tabela de apoio é **obrigatório**, não
  opcional.

## Superfície, borda e sombra

Um papel, uma medida. Quando duas telas resolvem a mesma coisa de dois jeitos,
o sistema deixa de parecer um sistema.

**Espaço dentro do cartão.** Uma calha só, de 20px, para que a primeira letra de
toda linha caia embaixo do título do cartão.

| Papel | Medida |
|---|---|
| Cabeçalho do cartão e faixa de filtro | `px-5 py-4` |
| Corpo do cartão | `p-5` |
| Item de lista dentro do cartão | `px-5 py-3` |
| Célula de tabela | `px-5 py-2.5` — fecha a linha em 44px |
| Rótulo → campo | `mt-1.5` |

**Raio.** `rounded-marca` é superfície que guarda outra coisa (cartão, painel,
caixa de solta). `rounded-marca-p` é controle (botão, campo, aviso, chip).
`rounded-marca-g` é o que cobre a tela (diálogo). `rounded-marca-interno` é o
filho encostado na borda interna do pai — o raio do pai menos a folga, senão o
canto de dentro estufa. `rounded-full` só para pílula e disco.

**Borda.** `border-borda` separa duas superfícies. `border-borda-forte` é
realce: hover e amostra de cor. `border-borda/60` é divisória **dentro** de um
cartão — ela não pode pesar igual à borda do próprio cartão. Fio de identidade
(faixa da marca, item ativo do menu, item pendente) tem 3px, sempre.

**Sombra.** Três degraus, um por profundidade, e nada fora deles. Os valores de
tema claro e escuro são **escolhidos**, não a mesma opacidade: preto a 32% sobre
um fundo quase preto é profundidade, sobre branco é sujeira.

| Token | Papel |
|---|---|
| `shadow-baixa` | o que está pousado na página: cartão, botão primário |
| `shadow-media` | o que flutua por cima dela: dica de gráfico |
| `shadow-alta` | o que cobre a página: painel lateral, diálogo |

**Lavagem da marca.** A escada `--mv-primaria-06/10/16/24/40/64` tem papel
definido — 06 repouso tingido, 10 passagem do ponteiro, 16 selecionado, 24
disco, 40 borda sobre fundo tingido, 64 véu — e é ela que se usa, nunca uma
opacidade escrita à mão no componente.

## Movimento, foco e toque

- Movimento é curto: `--mv-duracao` (150ms) e `--mv-curva`, que são o padrão de
  toda transição do app. Só opacidade e 4px de deslocamento.
  `prefers-reduced-motion: reduce` zera tudo, inclusive rolagem suave.
- `:focus-visible` desenha um anel de 2px com 2px de folga, em `--mv-foco` — a
  cor de maior contraste contra o fundo daquele restaurante. Em todo elemento
  interativo, sem exceção. O anel **não força raio** (ele acompanha o do próprio
  elemento) e leva um fio interno na cor do fundo, para continuar visível em
  cima da primária, de um selo colorido ou da linha selecionada.
- Todo elemento clicável tem os quatro estados: repouso, `hover`, `active` e
  `disabled`. Faltar `active` é o clique que não responde.
- Alvo de toque mínimo de **44px** (`--mv-toque`, classe `.mv-toque`). Controle
  sem texto leva `aria-label`, e o `Botao` só de ícone já nasce com os 44px.
- Área segura do aparelho (`.mv-segura-b`, `.mv-segura-x`) em tudo que gruda no
  rodapé ou encosta na lateral: barra de totais, rodapé do painel, rodapé da
  barra lateral.
- Texto passa AA (4,5:1). Ícone, borda de campo e marca de gráfico passam 3:1.

## Proibido

1. **Hexadecimal de marca dentro de componente.** Sempre `var(--mv-*)` ou a
   classe (`bg-primaria`, `text-acento`, `rounded-marca`). A única exceção é
   quando a tela mostra **vários restaurantes ao mesmo tempo** (o painel do
   master): aí a cor vem do banco, por `props`, para o `style` — nunca escrita
   no código.
2. **Cor de marca em estado.** Sucesso, alerta, erro e informação são fixos.
3. **Cor como única informação.** Sempre acompanha texto ou ícone.
4. **Cinza do Tailwind** (`gray`, `slate`, `zinc`). Use a escala `neutro`.
5. **Número sem `.mv-numero`** em coluna de tabela ou em cartão de valor.
6. **Dois eixos Y no mesmo gráfico.** Duas medidas de escalas diferentes viram
   dois gráficos.
7. **Raio de borda em pixel solto.** Use `rounded-marca`, `-marca-p`, `-marca-g`,
   `-marca-interno`: o raio é escolha do restaurante.
8. **Tamanho de fonte em pixel solto.** Use a escala acima — e `text-sm`,
   `text-xs` e companhia são pixel solto com outro nome.
9. **Sombra fora dos três degraus**, e opacidade de marca escrita à mão
   (`bg-primaria/20`) em vez da escada.
10. **Concordância por parêntese.** "3 item(ns)" é rascunho; use `plural()`.

## Como um restaurante novo entra com a própria cara

1. O master cadastra o restaurante. As colunas de marca em `restaurantes` já
   nascem com os padrões do Multiverso (`MARCA_PADRAO`), então a primeira tela
   já está inteira e coerente — ninguém vê um esqueleto sem cor.
2. O admin abre **Configurações → Identidade** e mexe nos controles de
   `CampoDeMarca`: `SeletorDeCor` (com o contraste medido embaixo do campo),
   `EnvioDeLogo` (arrasta o arquivo, vai para `marcas/<restaurante_id>/…`),
   `SeletorDeFonte` (lista curta e curada, prévia ao vivo).
3. `PreviaDaMarca` mostra cabeçalho, botão, tabela, gráfico e estados com as
   cores escolhidas — escrevendo as mesmas `--mv-*` num `style` local, ou seja,
   é o mecanismo do app inteiro dentro de um cartão. O que se vê ali é o que vai
   ficar.
4. `validarMarca` aponta o que reprova em AA, em português, dizendo a razão
   medida. **O aviso não bloqueia**: a marca é do cliente, a decisão é dele.
5. Salvou: `ProvedorDeMarca` aplica as novas variáveis no `<html>` e pede as
   fontes ao Google Fonts. A tela se repinta sem recarregar e sem piscar —
   trocar de restaurante é reescrever variáveis, não remontar a árvore.

## Onde mora o quê

```
web/src/estilos.css                     entrada do Tailwind, :root, @theme, base
web/src/tema/marca.ts                   contraste, derivadas, paleta, validação
web/src/tema/ProvedorDeMarca.tsx        contexto, fontes, tema, useMarca()
web/src/componentes/Logo.tsx            a logomarca do Multiverso
web/src/componentes/LogoDoRestaurante.tsx  logo do cliente, ou monograma
web/src/componentes/CampoDeMarca.tsx    os controles do admin
```
