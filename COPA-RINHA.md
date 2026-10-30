# Interface da Copa Rinha

Branch: `feat/copa-rinha-gimmick-ui` no fork `R1quelmer/pokemon-showdown-client`.
O formato no servidor é `[Copa Rinha] National Dex ZA`, ID
`coparinhanationaldexza`. Esta alteração não modifica o servidor nem acrescenta
Pokémon, Megas, itens ou campos de protocolo.

## Comportamento

Todas as mecânicas oferecidas na request atual permanecem visíveis. Selecionar
Mega, Z, Dynamax/Gigantamax ou Tera desmarca a seleção anterior para aquela
ação. Desmarcar volta ao ataque comum. A seleção é cancelável e não consome
um uso: o servidor continua responsável pelos limites por batalha e pelo
bloqueio permanente de cada Pokémon.

Não há uma flag global de "já usou uma gimmick". Os limites de Mega, Z, Max e
Tera continuam independentes. As opções não são inferidas do item, da geração
ou do nome do formato. Mega X/Y e Ultra Burst passam pela mesma proteção de
seleção de ação, quando oferecidos.

## Arquivos

| Arquivo | Alteração |
| --- | --- |
| `play.pokemonshowdown.com/src/battle-choices.ts` | Seleção exclusiva, validação de disponibilidade/conflitos no parser e serializador, preservação de alvo/undo/continuação Max |
| `play.pokemonshowdown.com/src/panel-battle.tsx` | Usa o helper de seleção, mantém todos os controles oferecidos e os menus Z/Max existentes |
| `play.pokemonshowdown.com/src/oldclient/client-battle.js` | Menus base/Z/Max separados; seleção exclusiva; validação antes do envio; PP, alvos, disabled, tooltips e rótulos G-Max corretos |
| `test/battle-choices.test.js` | Regressões de parsing, serialização, requests, seleção, formatos com uma única mecânica e cancelamento |
| `test/battle-mechanics-ui.test.js` | Renderiza os controles modernos reais em VNodes e executa seus handlers |
| `test/oldclient-battle-choices.test.js` | Renderização e handlers legados, proteção no envio, opções atuais e compatibilidade |
| `COPA-RINHA.md` | Instalação, validação, limites da QA e roteiro visual |

No legado, o fluxo real é `BattleRoom.choice.choices` → `chooseMove` →
`sendDecision`; não existe uma classe `BattleChoice`/`getAction` nesse caminho.
No moderno, `BattleChoiceBuilder.selectMoveSpecial` limpa as outras flags e
`validateMoveSpecial` protege também escolhas construídas programaticamente.
O parser considera flags inferidas por nomes de Z/Max Moves. Uma request
posterior não recupera opções a partir de Pokémon antigos na memória.

O suporte a duas Megas em ativos diferentes de formatos que declaram
`allowMultipleMegas` foi preservado. Isso não permite duas mecânicas na mesma
ação do mesmo Pokémon. Durante Dynamax, os Max Moves continuam disponíveis
sem enviar uma segunda ativação.

## Instalação e checks

Requer Node >= 22.18 e npm. Use o checkout existente; não é necessário criar
um worktree. Na raiz do cliente:

```sh
npm ci
```

O build completo usa um checkout de dados do servidor em
`caches/pokemon-showdown`. Se não existir, prepare-o sem modificar o servidor
de desenvolvimento:

```sh
git clone https://github.com/R1quelmer/pokemon-showdown.git caches/pokemon-showdown
npm ci --prefix caches/pokemon-showdown
```

Com esse cache preparado:

```sh
node build full --no-update
npm test
```

O primeiro comando gera os dados usados pelo cliente e pelos testes completos.
`npm test` reconstrói os arquivos alterados, roda TypeScript do cliente e de
`build-tools`, ESLint com zero avisos e todas as suítes disponíveis, incluindo
`test/full` quando seus dados estão presentes. Depois de alterações apenas na
interface, `npm run build` reutiliza os dados; não é preciso regenerar todos os
índices a cada edição.

Os testes de regressão também podem ser executados diretamente após o build:

```sh
node --test test/battle-choices.test.js test/battle-mechanics-ui.test.js test/oldclient-battle-choices.test.js
```

## Teste visual contra seu servidor

1. Inicie o servidor Copa Rinha pelo fluxo já configurado, mantendo sua branch
   e configuração atuais. O cliente precisa alcançar seu host e porta.
2. Após o build, sirva **`play.pokemonshowdown.com` como raiz HTTP**. A partir
   da raiz do repositório do cliente:

   ```sh
   python3 -m http.server 8081 --directory play.pokemonshowdown.com
   ```

3. No navegador, abra `testclient-new.html?~~HOST_DO_SERVIDOR:8000` nessa raiz
   HTTP. Para o antigo, use `testclient-old.html?~~HOST_DO_SERVIDOR:8000`.
   Substitua o host e a porta pelos do seu servidor. Servir a raiz do
   repositório em um subcaminho quebra o caminho absoluto do worker `/js/`.
4. Abra duas sessões de navegador independentes, escolha os nomes dos
   jogadores e envie um desafio no formato Copa Rinha. A autenticação de
   contas, quando necessária, usa o fluxo existente do test client; não há
   um novo servidor de login nesta implementação.
5. Use Venusaur com Venusaurite e Tera Type: confira Mega/Dynamax/Tera juntos.
   Alterne as opções antes de escolher o ataque. Apenas uma deve ficar marcada.
6. Use Pikachu com Pikanium Z, Volt Tackle e a opção Gigantamax habilitada no
   set. Confira Z-Power/Gigantamax/Tera juntos. Alternar Z/G-Max deve trocar a
   lista de ataques entre Catastropika e G-Max Volt Crash; Tera restaura ataques
   comuns. Os outros controles continuam visíveis.
7. Confirme uma ação e confira a request do turno seguinte. O Pokémon usado
   perde as outras opções; os companheiros ainda podem usar seus recursos
   independentes. Teste Venusaur → Dynamax, Lucario com Lucarionite → Mega,
   Pikachu → Z e Garchomp → Tera. Em outra batalha, faça Pikachu → G-Max e use
   outro portador de Z-Crystal, por exemplo Mew com Psychium Z e Psychic.
8. Repita os passos no cliente antigo e confira também cancelar, escolher um
   alvo e os turnos seguintes de Dynamax.

## Cobertura e limites

Além das suítes Node, a QA usa Chromium real com requests e logs gerados pelo
simulador Copa Rinha. As rooms recebem esses dados e os cliques ocorrem no DOM
real. Os comandos são interceptados para conferir sua serialização, sem
depender de contas ou de um serviço de login. Isso valida a interface e o
protocolo de escolha, mas não equivale a uma partida autenticada completa de
duas pessoas através da conexão de produção.

Resultados finais desta implementação:

- `node build full --no-update`: aprovado; dados de build gerados sem editar
  os arquivos do servidor de desenvolvimento.
- `npm test`: TypeScript do cliente e de build-tools, ESLint com zero avisos
  e **109 testes aprovados, 1 ignorado, zero falhas**. Inclui `test/full`.
- Testes focados: 34 do builder moderno, 11 dos controles modernos e 25 do
  cliente antigo, todos aprovados. Esses testes estão incluídos no total acima.
- Chromium: 20 cenários únicos aprovados nos dois clientes, além de quatro
  repetições para screenshots/verificação do último build; 80 transições de
  checkbox verificadas. Os 20 comandos de fixtures legais capturados foram
  aceitos pelo simulador Copa Rinha. Fixtures sintéticas com as quatro flags
  simultâneas serviram apenas como stress test do protocolo na UI.
- O estado e o conteúdo dos nove arquivos já modificados/criados no checkout
  do servidor foram comparados antes/depois e permaneceram iguais. Não houve
  merge nem alteração de branch no servidor.

O repositório não inclui todos os sprites/áudios. Neste ambiente, recursos de
CDN ausentes/bloqueados deixaram imagens sem carregar e um erro de áudio sem
source; esses recursos não foram usados para aprovar os controles. PHP não
está instalado: o build conclui, mas seu passo opcional de atualização de
notícias emite um aviso. Login/registro, notícias, sprites e áudio não foram
reimplementados nesta tarefa.

Durante a QA, o processo de servidor que já estava em execução também enviou
um aviso EPIPE ao cliente antigo. Esse problema operacional não foi corrigido
nesta tarefa de interface; a aprovação dos controles usou os logs/requests
conhecidos do simulador e a aceitação independente dos comandos, conforme
descrito acima.

## Replays próprios — Etapa 1

A página `/replay.html?id=<id>` usa o motor Battle local e consulta somente
`https://copa-rinha-showdown.onrender.com/copa-rinha/replays/<id>`.
Não armazena replays no serviço oficial. Sprites e áudio seguem os recursos
padrão do motor Showdown; a reprodução começa sem áudio.

No Render, mantenha a branch `feat/copa-rinha-gimmick-ui`, publique
`play.pokemonshowdown.com` como raiz e gere os dados e scripts no build:

```sh
npm ci
# Na primeira configuração, preparar o cache na branch do servidor:
git clone --branch feat/copa-rinha-national-dex-za --single-branch https://github.com/R1quelmer/pokemon-showdown.git caches/pokemon-showdown
npm ci --prefix caches/pokemon-showdown
node build full --no-update
```

Em builds seguintes, reutilize o cache ou recrie-o; se persistido, atualize-o
para o commit desejado antes do build. Garanta que `/replay.html` seja servido
como arquivo, preservando a query string, sem redirect para o testclient.
Nenhuma credencial R2 pertence ao cliente.

Teste real: depois dos dois deploys, abra duas sessões do cliente, termine uma
batalha `gen9coparinhanationaldexza` e espere “Replay da Copa Rinha salvo”.
Use “Assistir replay” e “Copiar link”; abra o endereço em outra sessão e no
celular. Confira jogadores, vencedor, data, turnos e controles de reprodução.
Use as quatro mecânicas na partida para conferir as respectivas animações.
Teste também forfeit e empate; outro formato não deve gerar esse anúncio.
Confira que o JSON privado `replays/<id>.json` existe no painel R2 e que a API
retorna os mesmos metadados, sem mensagens humanas de chat.

Validação local: `node build full --no-update` e `npm test` (TypeScript de cliente
e build-tools, ESLint, testes unitários e full). Os testes de carregamento usam
API e DOM mockados. Chromium móvel também foi executado com API interceptada e
motor Battle real, sem erro JavaScript e sem overflow horizontal. A rede deste
ambiente bloqueou sprites/áudio da CDN; a aparência completa precisa de QA no
site. O aviso de PHP ausente no build afeta apenas atualização opcional de notícias.
R2 real não foi testado neste ambiente.

## Controles nativos de replay e perspectiva

A página própria reutiliza as mesmas APIs do player oficial, investigadas em
`replay.pokemonshowdown.com/src/replays-battle.tsx` e
`play.pokemonshowdown.com/src/replay-embed.ts`:

- `Battle.switchViewpoint()` → `setViewpoint()` troca `nearSide`/`farSide` e
  reconstrói a cena no turno atual. Isso inclui sprites, treinadores, nomes,
  times, HP, campo e animações; o CSS apenas mantém a escala móvel existente.
- `play()`, `pause()` e `reset()` controlam reprodução e reinício.
- `seekBy(1/-1)` navega entre turnos, incluindo navegação durante busca;
  `seekTurn(numero/Infinity)` vai para um turno ou até o final.
- Velocidade usa as cinco opções oficiais e os mesmos valores de
  `messageFadeTime`/`messageShownTime`, com `scene.updateAcceleration()`.
- `subscribe()` sincroniza os controles com reprodução, pausa e fim do replay.

A interface inclui turno anterior/próximo, ir para um turno, ir para o fim,
reproduzir novamente após o fim, trocar lados com indicação de quem está embaixo,
e copiar link. Metadados, protocolo, endpoint e URL de entrada foram preservados.
Não houve alteração no motor Battle, na batalha ao vivo nem no servidor.

Validação desta etapa:

```sh
node build full --no-update
npm test
# Chromium já instalado no sistema:
CHROMIUM_PATH=/usr/bin/chromium npm run test:replay-browser
# Alternativa para desenvolvimento, usando o Chromium do Playwright:
# npx playwright install chromium
# npm run test:replay-browser
```

Build completo aprovado. `npm test` aprovou TypeScript do cliente e build-tools,
ESLint e 165 testes (1 ignorado), incluindo oito testes unitários do replay.
Chromium real aprovou controles e troca de perspectiva em 1000, 390 e 320 px,
incluindo troca durante reprodução, dupla troca, retorno ao turno anterior,
reconstrução de HP/clima, Mega, Z, Tera, G-Max e término por forfeit.
O teste de navegador usa protocolo sintético e API mockada com o motor nativo
real. Sprites/áudio externos são bloqueados no teste, portanto não é uma
validação visual desses arquivos nem um teste de produção/R2.
O aviso de PHP ausente na atualização opcional de notícias continua sem impedir o build.

Para deploy no Render, use o serviço estático do cliente, branch
`feat/copa-rinha-gimmick-ui`, **Manual Deploy → Deploy latest commit**.
Mantenha o comando de build completo e o diretório publicado
`play.pokemonshowdown.com` já configurados. Aguarde o build/deploy terminar e
abra um replay existente em `/replay.html?id=<id>`; recarregue a página para
obter os scripts novos. Não é necessário mudar variáveis, servidor, R2 ou API.
Confira Trocar lados no meio do replay e novamente para retornar, inclusive no
celular, e teste navegação/velocidade/copiar link.

Diferenças restantes frente ao site oficial: esta página mantém o layout e os
metadados próprios da Copa Rinha; não inclui atalhos globais de teclado,
seletor de tema, controles de volume/música, download de HTML nem persistência
de perspectiva/turno na URL. A reprodução continua iniciando sem áudio.

## Redesign visual do replay

A página usa `style/copa-replay.css` para a identidade azul-marinho/ciano,
cabeçalho compacto, metadados separados, controles agrupados e log escuro.
O ID técnico do formato é apresentado como “National Dex ZA”; os textos da
perspectiva e do encerramento são formatados apenas para exibição. As APIs,
handlers, player e protocolo permanecem os mesmos da etapa aprovada.

Validação: `npm test` (TypeScript, lint, 165 aprovados e 1 ignorado) e
`CHROMIUM_PATH=/usr/bin/chromium npm run test:replay-browser`, com player nativo
em 1440, 1000, 390 e 320 px, sem overflow horizontal. Para capturas locais,
defina `REPLAY_SCREENSHOTS` para um diretório existente. A API é mockada e os
recursos externos de sprites/áudio são bloqueados na QA automatizada.

## Refinamento final de tipografia, escala e feedback

Barlow Condensed 600/700/800 e Inter 400/500/600 são servidas localmente em
`style/fonts/`, com `font-display: swap` e fallbacks de sistema. Os arquivos Latin
incluem acentos portugueses e as respectivas licenças OFL. Origem: pacotes
`@fontsource/barlow-condensed@5.3.0` e `@fontsource/inter@5.3.0`. Nenhuma fonte exige
chamada a terceiros. Barlow identifica marca, jogadores e seções; Inter atende
metadados, controles e log. A frase do canto direito foi removida, o topo foi
compactado e o contraste do log/controles foi refinado.

O conjunto principal tem 960 px úteis no desktop. A cena continua com geometria
nativa de 640 × 360 e recebe uma única escala uniforme baseada na largura do
viewport, incluindo a altura correspondente. Não há alteração nos sprites,
protocolo, mecânicas ou implementação do BattleScene/switchViewpoint.

O antigo “Turno 0 / 1” era um campo de navegação não sincronizado: o placeholder
ou último destino digitado permanecia visível, embora Battle.turn e o campo
nativo já estivessem no turno 1. O campo agora acompanha a assinatura do motor,
com -1 (antes do início) apresentado como 0 e os turnos reais sem deslocamento.
Um destino em edição é preservado; ao enviar a busca, o campo perde foco e volta
a refletir o turno exibido. Reset, seek, fim e forfeit são cobertos no navegador.

Copiar link usa feedback acessível posicionado fora do fluxo, por dois segundos.
Cópias repetidas reiniciam o prazo. Se o clipboard falhar, o endereço permanece
no feedback para cópia manual. O status de carregamento continua acessível e
falhas de carregamento continuam visíveis.

Validação: `npm test` aprovou build incremental, TypeScript do cliente/build-tools,
ESLint e 168 testes (1 ignorado), incluindo 11 testes unitários do replay.
Chromium com motor nativo, API mockada e fontes locais aprovou 1440, 1000, 390 e
320 px, com todos os controles anteriores, contador em replay de um turno,
forfeit, nomes longos, toast visível dentro da tela e desaparecimento automático.
Sprites/áudio da CDN são bloqueados nesse teste; as capturas validam layout e
estado do motor, sem atestar carregamento desses recursos externos em produção.

## Logo oficial no cabeçalho do replay

`assets/copa-rinha/logo.png` é o PNG oficial fornecido pelo usuário, copiado sem
alteração (3344 × 1882). O original já contém canal alpha e fundo externo
transparente; o preto da prévia não é um retângulo opaco no arquivo. Por isso,
não foi necessário remover fundo, redesenhar, recortar ou processar a arte.
O cabeçalho usa 112 px de largura no desktop e 92 px no celular, com altura
automática, mantendo todo o canvas e a proporção original. “REPLAY” permanece
ao lado. A QA Chromium verifica carregamento, dimensões naturais, proporção e
largura exibida em 1440, 1000, 390 e 320 px, além dos controles existentes.

## Últimos ajustes de navegação e proporção

A logo permanece à esquerda, alinhada ao conteúdo, com 140 px no desktop e
92 px no mobile, sem corte nem alteração do asset. Seu link interno é
`/copa-rinha.html`, na mesma aba, com cursor de link e aria-label de retorno à
página inicial. Essa página já existente encaminha ao testclient da Copa Rinha.

A largura útil máxima do conjunto foi reduzida de 960 para 880 px (main externo
928 px com 24 px de padding por lado). Usar 1050 px aumentaria a versão anterior;
880 px mantém o player maior que os 640 px originais e diminui moderadamente sua
altura. O motor e sua escala proporcional não foram alterados. Nas viewports
desktop testadas de 1440 × 844 e 1000 × 844, a barra de controles cabe na primeira
tela. Mobile continua usando a largura disponível com as margens atuais.

QA: `npm test` aprovou build incremental, TypeScript, lint e 168 testes (1
ignorado). Chromium validou 1440, 1000, 390 e 320 px, alinhamento, proporção,
limite de largura, ausência de overflow, controles e clique real na logo.
`/copa-rinha.html` respondeu HTTP 200 no servidor local e fez seu encaminhamento
existente para `testclient-new.html`; não houve solicitação à raiz `/`.

## Formato único: Copa Rinha II

O nome público agora é **Copa Rinha II**; o ID de protocolo, armazenamento de
times e replays permanece `gen9coparinhanationaldexza`. `Dex.normalizeTeamFormat`
resolve os nomes novos e IDs legados, e os parsers nativos moderno/legado mantêm
o ID canônico ao receber o nome novo. O construtor BattleFormat continua derivando
Gen 9/National Dex do ID, portanto mantém os dados e buscas de Mega, Z, Tera e Max.

A política de apresentação fica centralizada no carregamento de BattleFormats.
Na entrada Copa Rinha (nickname local habilitado ou servidor configurado como
`copa-rinha-showdown.onrender.com`), a lista pública contém apenas Copa Rinha II.
Fora dessa entrada o cliente mantém todos os formatos recebidos. Para QA contra
localhost, pode-se definir `Config.copaRinhaSingleFormat = true` antes dos scripts.
Search/Challenge usam o formato canônico, os seletores nativos mostram a única
opção e novos times já nascem nesse formato. Preferências antigas de estrelas
não reintroduzem formatos oficiais no seletor. Times de outros formatos já
armazenados não são apagados nem convertidos silenciosamente; podem ser abertos
e explicitamente reassociados à Copa no editor. Import/export e os IDs dos times
Copa existentes continuam compatíveis. Não foram removidos dados oficiais.

Replays antigos mantêm metadados e log armazenados. Só os rótulos visuais da
página e do log de replay usam Copa Rinha II; a API e seu filtro de ID permanecem
iguais. A restrição real de criação de partidas é responsabilidade do servidor.

### Deploy coordenado

1. Faça deploy **primeiro do cliente**, branch `feat/copa-rinha-gimmick-ui`.
   Ele compreende tanto a lista/nome antigos quanto os novos. Mantenha o build
   completo e a publicação de `play.pokemonshowdown.com`. O cache de dados do
   servidor deve usar `feat/copa-rinha-national-dex-za`, como já configurado;
   se persistido, atualize esse checkout para o commit desta etapa antes do build.
2. Após o cliente estar Live, faça deploy do servidor na branch
   `feat/copa-rinha-national-dex-za`. O preset Render habilita automaticamente
   a política exclusiva. Nenhuma credencial/variável R2 muda.
3. Recarregue o cliente para atualizar scripts. Confira o único formato em
   busca, challenge e editor; crie/import/exporte e valide um time. Envie um
   desafio Copa e teste as quatro mecânicas. Tentativas `/search gen9ou` e
   `/search gen9randombattle` devem ser rejeitadas. O mesmo vale para challenge
   e regras customizadas. Antes do deploy do servidor, a busca ainda segue a
   disponibilidade antiga; a experiência fica completa após os dois deploys.
4. Termine a partida e teste seu replay e um link antigo. Confira o nome Copa
   Rinha II e o ID canônico na resposta JSON. Confirme o novo objeto no R2 privado.

Validação automatizada: build completo aprovado; `npm test` aprovou TypeScript,
lint e 172 testes (1 ignorado). Chromium aprovou os quatro cenários
moderno/legado × lista antiga/nova. Comandos: `npm test`,
`CHROMIUM_PATH=/usr/bin/chromium npm run test:copa-format-browser` e
`CHROMIUM_PATH=/usr/bin/chromium npm run test:replay-browser`.
O teste de formatos exercita os dois clientes nativos com listas antiga/nova,
picker único e criação de time. A conexão externa é bloqueada e a lista do
servidor é injetada; ele não equivale a uma partida entre dois usuários no Render.
Os testes de replay também usam API mockada. R2 real não foi acessado nesta etapa.
