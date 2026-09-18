# Colocar o Multiverso no ar

Do zero a um sistema rodando com dados reais. São quatro etapas; as que só você
pode fazer estão marcadas com **você**.

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

Isso aplica as 10 migrações, carrega os 854 produtos do Bar do Zeca e publica a
função que lê NFe. É idempotente: rodar de novo não duplica nada.

Sem `--com-carga` o banco sobe vazio, que é o certo se o primeiro restaurante
não for o Bar do Zeca.

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

Para publicar de verdade, a pasta `dist/` é um site estático. Qualquer um serve:

| Onde | Como |
|---|---|
| **Vercel** | `npx vercel --prod` (build `npm run build`, saída `dist`) |
| **Netlify** | `npx netlify deploy --prod --dir=dist` |
| **Cloudflare Pages** | conectar o repositório, build `npm run build`, saída `dist` |

Em qualquer um deles, repita as duas variáveis `VITE_*` nas configurações do
projeto — elas entram no build, não em tempo de execução.

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
