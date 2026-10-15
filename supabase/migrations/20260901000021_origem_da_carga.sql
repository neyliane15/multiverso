-- ---------------------------------------------------------------------------
-- 0021 · De quem e cada ficha: `fichas.origem_carga`
--
-- Uma carga de semente precisa responder uma pergunta antes de apagar qualquer
-- coisa: "esta ficha e minha?". Ela e minha se uma versao ANTERIOR DE MIM mesma
-- a criou — e nesse caso, se o arquivo de hoje nao a tem mais, ela tem de sair.
-- Nao e minha se foi outra carga que a criou, ou se a casa a digitou na tela; e
-- nesses dois casos eu nao posso encostar nela.
--
-- Ate aqui a resposta era CALCULADA: toda ficha de carga nasce com
-- `id = UUIDv5(restaurante_id, '<prefixo>:' || nome)`, e a carga reconhecia as
-- suas refazendo essa conta em SQL (sha1, 16 bytes, versao 5 no byte 6) e
-- comparando com o id gravado. Ficha digitada na tela nasce de
-- `gen_random_uuid()` e nao satisfaz a igualdade nem por acidente — seriam 122
-- bits para acertar. Funciona, e esta medido que funciona.
--
-- MAS TEM DOIS DEFEITOS, e os dois sao do tipo que so aparece com o sistema em
-- uso de verdade:
--
--  1. **A CHAVE E MUTAVEL.** `nome` e coluna que a casa edita na tela. No
--     instante em que alguem renomeia um prato, a conta deixa de fechar e a
--     carga para de reconhecer a propria ficha. Enquanto o prato esta no
--     arquivo isso e inofensivo (a carga tambem a acha pelo id, e devolve o
--     nome). Mas se o prato for renomeado E depois sair do cardapio, a ficha
--     fica no sistema para sempre: a posse nao a alcanca e o `delete` de item
--     so varre o que esta no arquivo. Ninguem, em nenhuma versao futura da
--     carga, consegue remove-la.
--
--  2. **A CORRECAO DEPENDE DE CONVENCAO HUMANA.** O prefixo e o que separa uma
--     carga da outra: a 0004 usa `'ficha:'` e a 0005 `'ficha-executivo:'`. Se
--     uma 0006 for escrita copiando a 0004 e alguem esquecer de trocar o
--     prefixo, ela apaga as 56 fichas de drinque na primeira aplicacao, em
--     silencio. Isso nao e hipotese: a propria 0005 nasceu com `'ficha:'` e so
--     um teste pegou.
--
-- A SAIDA E PARAR DE CALCULAR A POSSE E PASSAR A GRAVA-LA. Uma coluna de texto
-- com o nome da carga. Nula quando a ficha nasceu na tela — e nulo aqui quer
-- dizer "da casa", que e a leitura certa: nenhuma carga a reivindica.
--
-- Com ela, o `delete` de cada carga vira uma linha sem aritmetica nenhuma:
--
--     delete from fichas
--      where restaurante_id = … and origem_carga = '0005'
--        and id not in (select id from arquivo_fichas);
--
-- e as tres propriedades que importam passam a valer por CONSTRUCAO, e nao por
-- uma conta que pode ser copiada errado: alcanca a ficha renomeada (o rotulo
-- nao muda quando o nome muda), nunca alcanca a ficha de outra carga (o rotulo
-- e outro), nunca alcanca a ficha da casa (o rotulo e nulo). E serve N cargas
-- sem coordenacao: cada uma escreve o seu proprio literal.
--
-- A coluna e aditiva e nula por omissao, entao ela nao muda nenhum
-- comportamento existente: uma carga que nao a conheca continua funcionando
-- como antes. O que muda e que as cargas 0004 e 0005 passam a ler o rotulo em
-- vez de recalcular o hash — 20 e 21 linhas de SHA-1 a menos, respectivamente.
-- ---------------------------------------------------------------------------

alter table fichas add column if not exists origem_carga text;

comment on column fichas.origem_carga is
  'A carga de semente que criou esta ficha (0004, 0005, …). Nulo = criada na tela pela casa, e nenhuma carga a apaga. E por esta coluna que cada carga sabe quais fichas sao suas.';

-- O indice serve as duas consultas que a carga faz: o `delete` por posse e a
-- montagem do escopo. Leva o `restaurante_id` na frente porque toda consulta do
-- sistema e por tenant, e sem ele o indice seria inutil num banco com varios.
create index if not exists fichas_origem_carga_idx
  on fichas (restaurante_id, origem_carga);

-- ---------------------------------------------------------------------------
-- O backfill: carimbar o que JA existe, uma vez
--
-- Sem isto, as fichas que estao no banco hoje ficariam com `origem_carga` nula
-- — ou seja, indistinguiveis de ficha feita na tela — e nenhuma carga as
-- reconheceria como suas.
--
-- O criterio e a posse de HOJE: a mesma aritmetica de UUIDv5 que as cargas vao
-- deixar de usar, rodada uma ultima vez. Isso tem uma elegancia que vale dizer:
-- a conta nao e jogada fora, ela e CONSUMIDA — ela existe exatamente o tempo de
-- transformar o que era calculado em algo gravado.
--
-- Vale a pena? Quase nao, e eu mantenho de proposito. O `update` de carimbo que
-- cada carga passa a fazer casa por **id** contra `arquivo_fichas`, entao ele
-- resolve toda ficha que ainda esta no arquivo — inclusive a que ja foi
-- renomeada. Sobra UM caso para o backfill: se a primeira aplicacao depois
-- desta migracao ja vier com a lista encolhida, a ficha que saiu nunca seria
-- carimbada e sobreviveria um ciclo inteiro sem dono. O backfill custa dois
-- `update` que rodam uma vez; o caso que ele cobre custa uma ficha fantasma no
-- cardapio de alguem.
--
-- Idempotente de tres formas: so toca linha com `origem_carga` nula, so quando
-- o id ainda e o UUIDv5 do nome, e o `add column if not exists` acima deixa a
-- migracao passar duas vezes (que e o que `supabase db push` faz sempre que o
-- historico esta atras do banco — e a suite do projeto reaplica as 20 de
-- proposito por isso).
-- ---------------------------------------------------------------------------
do $$
declare
  v_0004 int;
  v_0005 int;
  v_schema text;
begin
  -- O backfill usa `digest()`, do pgcrypto, e aqui mora uma diferenca entre o
  -- Postgres de desenvolvimento e o Supabase que esta migracao ja pagou uma vez
  -- em producao, com `function digest(bytea, unknown) does not exist`:
  --
  --   a 0001 faz `create extension if not exists "pgcrypto"` sem dizer o
  --   schema. Num banco nosso, nascido vazio, isso instala em `public` e
  --   `digest()` fica visivel. No Supabase a extensao JA vem instalada no
  --   schema `extensions`, entao o `create extension` nao faz nada e a funcao
  --   nao esta no search_path da migracao.
  --
  -- A guarda antiga perguntava se a EXTENSAO existe. A pergunta certa e se a
  -- FUNCAO e alcancavel — no Supabase a primeira responde sim e a segunda nao.
  -- Entao: descobre onde o pgcrypto mora e poe aquele schema no search_path.
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_schema is not null then
    execute format('set local search_path = public, %I', v_schema);
  end if;

  -- E mesmo assim nao assume: se `digest` continuar inalcancavel, avisa e
  -- segue. A coluna e o indice ja existem, e e o carimbo que cada carga faz
  -- por `id` que leva o trabalho dai em diante — o backfill cobre so o caso
  -- de ficha que ja saiu do arquivo, que num banco sem fichas nem existe.
  if to_regprocedure('digest(bytea, text)') is null then
    raise warning '0021: digest() inalcancavel (pgcrypto em %), backfill de origem_carga nao feito. A coluna existe e as cargas carimbam sozinhas.',
      coalesce(v_schema, 'extensao ausente');
    return;
  end if;

  -- A 0004 (drinques) deriva o id de `'ficha:' || nome`.
  with posse as (
    select f.id,
           substring(digest(decode(replace(f.restaurante_id::text, '-', ''), 'hex')
                            || convert_to('ficha:' || f.nome, 'UTF8'), 'sha1')
                     from 1 for 16) as h
      from fichas f
     where f.origem_carga is null
  ), v5 as (
    select id,
           encode(set_byte(set_byte(h, 6, (get_byte(h, 6) & 15) | 80),
                           8, (get_byte(h, 8) & 63) | 128), 'hex') as hex
      from posse
  )
  update fichas f set origem_carga = '0004'
    from v5
   where f.id = v5.id
     and f.origem_carga is null
     and f.id::text = substring(v5.hex, 1, 8) || '-' || substring(v5.hex, 9, 4) || '-'
                   || substring(v5.hex, 13, 4) || '-' || substring(v5.hex, 17, 4) || '-'
                   || substring(v5.hex, 21, 12);
  get diagnostics v_0004 = row_count;

  -- A 0005 (executivos) deriva de `'ficha-executivo:' || nome`.
  with posse as (
    select f.id,
           substring(digest(decode(replace(f.restaurante_id::text, '-', ''), 'hex')
                            || convert_to('ficha-executivo:' || f.nome, 'UTF8'), 'sha1')
                     from 1 for 16) as h
      from fichas f
     where f.origem_carga is null
  ), v5 as (
    select id,
           encode(set_byte(set_byte(h, 6, (get_byte(h, 6) & 15) | 80),
                           8, (get_byte(h, 8) & 63) | 128), 'hex') as hex
      from posse
  )
  update fichas f set origem_carga = '0005'
    from v5
   where f.id = v5.id
     and f.origem_carga is null
     and f.id::text = substring(v5.hex, 1, 8) || '-' || substring(v5.hex, 9, 4) || '-'
                   || substring(v5.hex, 13, 4) || '-' || substring(v5.hex, 17, 4) || '-'
                   || substring(v5.hex, 21, 12);
  get diagnostics v_0005 = row_count;

  -- `warning` e nao `notice`: as cargas rodam com
  -- `set local client_min_messages = warning` e um notice aqui nao apareceria em
  -- `psql -f` — foi assim que o "ok" da 0004 ficou invisivel por tres laudos.
  -- Zero nas duas e o resultado NORMAL num banco novo, onde as migracoes rodam
  -- antes das cargas e ainda nao existe ficha nenhuma.
  raise warning '0021: backfill de origem_carga carimbou % ficha(s) como 0004 e % como 0005', v_0004, v_0005;
end $$;
