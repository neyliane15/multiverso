# Colocar o Multiverso no ar

Do zero a um sistema rodando com dados reais. São quatro etapas; as que só você
pode fazer estão marcadas com **você**.

---

## 0. Preparar o computador · **você**

Todos os comandos deste guia são digitados no **terminal do seu computador**,
dentro da pasta do projeto. Se você nunca fez isso, é este o caminho.

### Instalar as duas ferramentas

| | Windows | Mac |
|---|---|---|
| **Node.js** | [nodejs.org](https://nodejs.org) → botão **LTS** | [nodejs.org](https://nodejs.org) → botão **LTS** |
| **Git** | [git-scm.com/download/win](https://git-scm.com/download/win) | já vem instalado |

Reinicie o computador depois de instalar o Node.

### Abrir o terminal

- **Windows**: tecla Windows, digite `powershell`, Enter.
- **Mac**: Cmd + Espaço, digite `terminal`, Enter.

Confira se deu certo — cada comando tem de responder um número de versão:

```bash
node --version
git --version
```

### Baixar o projeto

```bash
git clone https://github.com/neyliane15/multiverso.git
cd multiverso
git checkout claude/clever-mccarthy-nnbtas
npm install
```

O `git clone` cria a pasta `multiverso` dentro de onde você estiver (no
Windows, normalmente `C:\Users\SeuNome`). O `cd` entra nela. **Daqui em
diante, todo comando deste guia é digitado nessa pasta** — se fechar o terminal,
abra de novo e faça `cd multiverso` antes de continuar.

Para ver o sistema rodando agora, antes mesmo do Supabase:

```bash
npm test          # 403 testes
npm run build
```

---

## 1. Criar o projeto no Supabase · **você**

1. Entre em [supabase.com](https://supabase.com) e crie a conta (o plano
   gratuito dá conta deste sistema com folga).
2. **New project**. Anote:
   - **Nome**: `multiverso`
   - **Database password**: guarde — a CLI vai pedir
   - **Region**: `South America (São Paulo)`, que é onde o cliente está
3. Espere uns dois minutos.

Na URL do painel está a **referência do projeto**:

```
https://supabase.com/dashboard/project/abcdefghijklmnopqrst
                                       └──── é esta parte ────┘
```

## 2. Subir o banco e a função · **um comando**

Instale a CLI e rode:

```bash
npm i -g supabase
supabase login                              # abre o navegador
ferramentas/implantar.sh <referencia> --com-carga
```

> **No Windows**, o PowerShell não roda `.sh`. Use o **Git Bash** — ele foi
> instalado junto com o Git: clique com o botão direito na pasta `multiverso` e
> escolha *Git Bash Here*. Ou rode os quatro passos na mão:
>
> ```
> supabase link --project-ref <referencia>
> supabase db push
> npm run funcao:preparar
> supabase functions deploy importar-nfe --project-ref <referencia>
> ```

Isso aplica as 10 migrações, carrega os 854 produtos do Bar do Zeca e publica a
função que lê NFe. É idempotente: rodar de novo não duplica nada.

Sem `--com-carga` o banco sobe vazio, que é o certo se o primeiro restaurante
não for o Bar do Zeca.

### Carregar o primeiro restaurante depois

Se o banco já subiu vazio, ou se você está no Windows e rodou os comandos na
mão, a carga entra assim:

```bash
npm run seed:carregar "<url-de-conexao>"
```

A URL está no painel em **Settings → Database → Connection string → URI** —
troque `[YOUR-PASSWORD]` pela senha que você escolheu ao criar o projeto.

O script existe porque `psql` não vem instalado no Windows e a carga tem 360 KB,
grande demais para colar no editor de SQL do painel sem sustos. Ele mostra as
mensagens de conferência que a própria carga emite, e ela **aborta a transação
inteira** se o total não fechar.

> A carga termina num bloco que **aborta a transação inteira** se o total não
> fechar em R$ 78.681,3573. Carga que mente é pior que carga que falha.

## 3. Criar o primeiro master · **você**

Ovo e galinha: o papel vem de um convite, e não há ninguém para convidar o
primeiro. Ele é semeado pelo banco.

No painel, **SQL Editor**:

```sql
select mv_semear_master('voce@seudominio.com.br', 'Seu Nome');
```

Depois, **Authentication → Users → Add user**, com **esse mesmo e-mail** e uma
senha. Marque *Auto Confirm User*.

A partir daqui a cadeia se sustenta: você convida os admins pela tela de
Usuários, e cada admin convida a equipe dele.

> **Por que assim.** Quem se cadastra **não** escolhe o próprio papel. Até a
> migração `0008` ele vinha dos metadados do cadastro, e qualquer visitante
> podia pedir `master` e receber a rede inteira. Hoje, cadastro sem convite não
> ganha perfil — e sem perfil não enxerga uma linha sequer.

## 4. Ligar o frontend · **você**

Em **Settings → API**, copie os dois valores para o `.env` na raiz:

```
VITE_SUPABASE_URL=https://<referencia>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

A anon key **pode** ficar no navegador: é isso que ela é. Quem protege os dados
é a RLS. A `service_role`, essa nunca — ela ignora toda política, e no navegador
entregaria o banco a quem abrisse o inspecionar.

```bash
npm install
npm run build
npm run preview          # confira em http://localhost:4173
```

### Publicar no Vercel

O jeito mais simples é ligar o repositório do GitHub: cada `git push` republica
sozinho.

1. Entre em [vercel.com](https://vercel.com) com a sua conta do GitHub.
2. **Add New → Project** e escolha o repositório `multiverso`.
3. Em **Environment Variables**, coloque as duas — **com estes nomes exatos**:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<referencia>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | a chave publicável do painel |

   São as mesmas do `.env`, que **não** vai para o GitHub — por isso precisam
   ser repetidas aqui.

4. **Deploy**.

O `vercel.json` já traz o build, a pasta de saída e — a parte que quebra calada
quando falta — a regra de reescrita. O Multiverso é uma página só, com o
roteamento no navegador: sem essa regra, abrir `/cmv` direto ou apertar F5 em
qualquer tela devolve **404**, porque o servidor procura um arquivo chamado
`cmv` que não existe. Funciona navegando pelo menu e quebra quando alguém
recarrega — que é o pior tipo de defeito, o que só aparece com gente usando.

As variáveis entram **no momento do build**, não em tempo de execução. Mudou uma
delas, é preciso publicar de novo (**Deployments → ... → Redeploy**).

### O que há dentro do `vercel.json`

Três coisas, e as três importam:

| | Por quê |
|---|---|
| `rewrites` | Toda rota serve o `index.html`. Sem isso, abrir `/cmv` direto ou apertar F5 devolve **404** |
| cache de `/assets/(.*)` | O Vite carimba o nome de cada arquivo com o hash do conteúdo, então podem ser guardados para sempre |
| cache de `/` | O `index.html` **nunca** pode ficar preso em cache — é ele que aponta para os arquivos novos depois de cada publicação |

O JSON do Vercel **recusa qualquer chave que ele não conheça**, inclusive uma
chamada `comment` — não dá para documentar o arquivo por dentro, e a tentativa
falha com `Invalid request: headers[0] should NOT have additional property`.
É por isso que a explicação mora aqui e não lá. `npm run vercel:conferir`
valida o arquivo antes de você descobrir isso no meio de uma publicação.

### Outras opções

| Onde | Como |
|---|---|
| **Netlify** | `npx netlify deploy --prod --dir=dist` (a reescrita precisa ser configurada à mão) |
| **Cloudflare Pages** | conectar o repositório, build `npm run build`, saída `dist` |
| **Qualquer servidor** | a pasta `dist/` é um site estático comum |

---

## Conferindo se ficou de pé

```bash
supabase db lint --project-ref <referencia>   # nada de erro
```

E na tela: entre como master, crie um restaurante em **Administração →
Restaurantes**, desenhe a marca dele em **Identidade visual**, convide um admin
em **Usuários**. Se o app repintou com as cores que você escolheu, o caminho
inteiro está funcionando.

## O que ainda não foi exercitado aqui

Duas coisas dependem de um Supabase real e por isso nunca rodaram no ambiente
de desenvolvimento — teste as duas primeiro:

- **Envio de logomarca** (bucket `marcas`, público)
- **Importação de XML de NFe** (bucket `notas` + edge function)

O parser de NFe tem 103 testes de unidade e o caminho do custo está provado até
o banco, mas o `supabase functions deploy` é o primeiro teste real do bundler.
`ferramentas/preparar-funcao.mjs` copia o parser para dentro da pasta da função
justamente porque o bundler não é confiável para seguir import que sai dela.

## Quando algo der errado

| Sintoma | Quase sempre é |
|---|---|
| `Faltam VITE_SUPABASE_URL...` | `.env` na raiz do repositório, não em `web/` |
| Login passa, telas vazias | Conta criada sem convite — rode `mv_semear_master` e recrie |
| `permission denied for table` | Migração `0006` não aplicou; rode `supabase db push` de novo |
| Função de NFe falha no deploy | Rode `npm run funcao:preparar` antes |
| Logo não sobe | O caminho no bucket tem de ser `<restaurante_id>/<arquivo>` |

## Autenticação: dois ajustes no painel do Supabase

Nenhum dos dois está no código — são configuração do projeto, e sem eles o
convite não fecha o ciclo.

**1. Para onde o link volta.** Authentication → URL Configuration:

- *Site URL*: o endereço de produção (`https://seu-projeto.vercel.app`). Sai
  de fábrica como `http://localhost:3000`, e é por isso que quem confirmava o
  e-mail caía numa tela que não existe.
- *Redirect URLs*: o mesmo endereço mais `/**`. O app manda
  `redirect_to=<origem>` em todo link que gera, mas o Supabase só obedece se a
  origem estiver nesta lista — fora dela, ele volta para o Site URL calado.

**2. Confirmação de e-mail.** Authentication → Providers → Email →
*Confirm email*.

Num sistema por convite ela é dispensável: quem entra precisa de um convite
gravado antes por quem tem poder de dá-lo, e é o convite que decide papel e
restaurante. Desligada, a pessoa se cadastra e já entra.

O que se perde ao desligar: a confirmação prova que quem digitou o e-mail é
dono dele. Sem ela, alguém que adivinhe um e-mail com convite **pendente**
pode tomar o lugar antes da pessoa certa. A janela é curta (convite vale 14
dias) e visível (a tela de Usuários mostra quem aceitou e quando).

Se mantiver ligada, o ciclo funciona igual — só com um passo a mais. E há a
saída para quem não confirmou: o convite é consumido no cadastro, então essa
pessoa não entra E não pode ser convidada de novo; a tela de entrada oferece
"Reenviar o link de confirmação" exatamente nesse erro.
