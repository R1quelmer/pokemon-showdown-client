# Copa Rinha II — entrega local, 24/11/2026

## Estado e commits

Servidor: `R1quelmer/pokemon-showdown`, branch `feat/copa-rinha-national-dex-za`.
Base preservada: `662ca40f3f5cd8c75c7dd222823c64dbb36c3059`.

- `9831efa4e09b13bad151d647f4180f4eed98bbd2`: Sleep Clause Mod nativa.
- `57c67d3616fff1429170661b0762abae977edb01`: adapter de teams no R2 e protocolo compatível.

Client: `R1quelmer/pokemon-showdown-client`, branch `feat/copa-rinha-gimmick-ui`.
Base preservada: `191b7c8a52840c900a33bbbd37e313f9035420c0`.

- `368e77f202c51b8df55cdaf03efa9aa9b5447886`: identidade local e infraestrutura de avatares.
- `f3c0b5fe5e1ac5441603c4fb0732ea489280e691`: compartilhamento e página/importação de times.
- O commit que contém este relatório finaliza tema, entrada `/` e QA visual.

Não houve push, deploy, alteração no Render, publicação de extensão ou exclusão de banco/objetos.
Não foi feita instalação de outro sistema de login, backend de contas ou banco alternativo de times.

## Implementações

### Regra competitiva

O formato canônico continua `gen9coparinhanationaldexza`, anunciado como Copa Rinha II.
Foi acrescentada somente a regra existente **Sleep Clause Mod** ao ruleset. Nenhuma
implementação própria de sono foi criada. Rest/autossono seguem a lógica upstream;
indução de sono e interações são julgadas pela regra nativa. As quatro gimmicks,
Mega Z-A, auto G-Max e os limites por Pokémon/jogador foram preservados.

### Times permanentes no R2

O plugin `server/chat-plugins/teams.ts` mantém os comandos nativos e escolhe o
adapter `server/copa-teams.ts` no modo Copa já existente. Fora da Copa, o caminho
PostgreSQL permanece upstream. Objetos usam `teams/<id>.json`; replays mantêm
`replays/<id>.json`. IDs têm 192 bits aleatórios e writes condicionais impedem sobrescrita.
Não há expiração no código, índice público, owner/nickname autenticado, senha ou
credencial no objeto. Quem possui o link pode ler/copiar/importar. Cada alteração
publicada gera nova cópia; apelido não concede propriedade/edição de outro snapshot.

API: `GET https://copa-rinha-showdown.onrender.com/copa-rinha/teams/<id>`.
Página: `https://copa-rinha-client.onrender.com/team.html?id=<id>`.
São usados serializadores e parsers nativos. Há limites de tamanho/sets, frequência,
projeção de campos na leitura e diagnóstico seguro do SDK. Detalhes de protocolo,
privacidade e limites estão em [COPA-RINHA-TEAMS.md](../pokemon-showdown/COPA-RINHA-TEAMS.md).

### Client próprio

- A raiz `/` abre o ambiente Copa; `/copa-rinha.html` permanece compatível e preserva hashes de navegação.
- Apelidos locais existentes foram preservados e reforçados; não significam conta autenticada.
- Senhas/cadastro oficial não são solicitados no modo local. Loginserver e chaves de sessão são ignorados nesse modo.
- Teambuilder e armazenamento local são nativos, sem ler dados de outro domínio. Importação compartilhada preserva times existentes e evita duplicatas.
- O compartilhamento usa `/teams save` e evento `copateamupload`, sem reutilizar o campo numérico de times de conta.
- `team.html` mostra builds completas, sprites, texto exportável, cópia de link e importação no Teambuilder. Erros não refletem dados internos do serviço.
- O alias de formato `gen9coparinhaii` recebido do servidor é reconhecido como o ID canônico existente; o protocolo transmitido e o ID armazenado não mudam.

### Identidade visual e avatares

Tema em `style/copa-rinha.css`, escopado por `html.copa-rinha`, inspirado no replay:
azul-marinho/preto, ciano, Inter e Barlow Condensed locais, logo real. Chrome da aplicação,
salas, chat, Teambuilder, seletores e popups usam o tema mantendo controles nativos.
Não há regras que redesenhem o campo interno de BattleScene. No replay só foi acrescentado
um formulário de abertura por link/ID quando a URL está sem ID, para a navegação Replays;
um replay carregado mantém player e controles aprovados.

`assets/copa-rinha/avatars.json` começa vazio. O administrador pode adicionar imagens
raster locais e associações de nick conforme seu README. O helper valida caminhos,
carrega somente no modo local e mantém fallback nativo se não houver imagem válida.
Nenhuma imagem de participante ou identidade foi inventada. A associação é somente visual.

O manifesto, mapa/método aprovado de sprites Z-A e os 74 GIFs permanecem intactos;
shiny sem asset conserva fallback. Licenças e créditos anteriores foram preservados.

## Compatibilidade oficial e limites

O client psim.us não foi alterado, nem sua autenticação, avatares, conexão, Showdex ou
protocolo de batalha. A regra de sono e o backend de times estão no servidor e atendem
as duas interfaces. Para o client oficial, o caminho suportado de compartilhamento é
`/teams upload`, formulário nativo, popup com URL Copa e `/teams view ID`.

O Teambuilder inline oficial espera IDs numéricos e cria `psim.us/t/...`; não é possível
mudar esse comportamento sem editar seu código ou o serviço global. Por isso o servidor
não injeta IDs R2 em `teamupload`. O evento Copa é ignorado pelo oficial; o popup entrega
o link correto, mas o botão inline pode permanecer em Uploading até reload. Não há
tracking de conta, update/delete de snapshots ou sincronização com storage oficial.

Testes não autenticaram conta real, não executaram Showdex nem acessaram o R2 de produção.
Recursos que dependem de conta oficial não passam a ter autenticação alternativa no modo local.
Nicknames continuam sendo identificadores não verificados, como antes; não tratá-los como prova de autoria.

## Variáveis e infraestrutura

Nenhuma nova variável é necessária. O servidor reutiliza exclusivamente:

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Não expor valores no client, logs, documentação ou commit. A credencial deve permitir
GetObject/PutObject nos prefixos de times e replays. Bucket continua privado. Confirmar
que regras de lifecycle externas não expiram `teams/`; o código não altera políticas do R2.
Não foi possível inspecionar recursos/configuração privados de produção.

PostgreSQL não é necessário para os novos times no modo Copa. Isso não comprova que o
banco existente não tenha dados/consumidores: não removê-lo nesta publicação. Fazer backup
antes de qualquer decisão posterior. Não há migração automática de links/IDs PostgreSQL.

## Testes efetivamente executados

- Servidor: build nativo, TypeScript e lint aprovados. **183 testes de regressão aprovados**, incluindo 16 de sono e 13 de teams; regressões de gimmicks, G-Max, Z-A, validação, protocolo, ladder/room-battle e replays.
- Client: `node build full --no-update` aprovado com dados da branch do servidor; inclui build do servidor. `npm test` aprovado: TypeScript client/build-tools, ESLint sem warnings, **199 aprovados, 1 ignorado**.
- Chromium: testes `copa-client.cjs`, `copa-team.cjs`, `copa-format.cjs`, `copa-replay.cjs` e `copa-za-sprites.cjs`, em 1440/1000/390/320 onde aplicável. Validam UI local, reconnect, persistência, upload, import/export, erros, texto seguro, cópia, perspectiva e 74 GIFs decodificados.
- Storage simulado: roundtrip, recuperação por outra instância, IfNoneMatch, erros SDK, CORS e leituras limitadas. Não substitui um teste real após restart/deploy.
- O aviso de PHP ausente afeta apenas notícias opcionais; não impediu os builds. O aviso de ausência de artigos da Smogon também não impede gerar os dados.

Fixtures usam HTTP/WebSocket interceptados e dados sintéticos; não são sessões no Render.
Sprites/áudio externos foram bloqueados nas fixtures; GIFs Z-A e fontes locais foram testados.
Capturas estão no pacote de entrega separado; não contêm credenciais ou usuários reais.

## Publicação futura — somente quando o proprietário decidir publicar

1. Revisar commits/diffs e manter as branches indicadas. Nenhum passo abaixo foi executado nesta tarefa.
2. Do servidor: `git push origin feat/copa-rinha-national-dex-za`. Do client: `git push origin feat/copa-rinha-gimmick-ui`.
3. No Static Site do client, manter diretório publicado `play.pokemonshowdown.com` e comando de build completo já configurado. Publicar o client primeiro por Manual Deploy → Deploy latest commit. O cache de dados deve usar a branch Copa do servidor como já preparado no setup; evitar cache de dados desatualizado.
4. No Web Service do servidor, manter build/start existentes (`npm run build` e `npm start`, ou equivalentes já configurados). Publicar a branch Copa. Não modificar porta/TLS/processos do preset Render.
5. Confirmar as quatro variáveis R2 existentes e os prefixos/lifecycle acima. Não criar PostgreSQL novo, tornar bucket público ou remover o banco antigo.
6. Depois de ambos Live: abrir a raiz, confirmar nickname local, compartilhar um time pequeno, copiar URL, abrir em outra sessão e importar. Reiniciar o serviço e reabrir o mesmo link. Só esse passo comprova persistência real e permissão no R2.
7. Pelo client oficial, usar `/teams upload`, confirmar popup correto e `view-team-ID`. Testar batalha com a Sleep Clause, Rest, as gimmicks e replay antigo/novo. Conferir G-Max e frente/costas dos sprites no client próprio, inclusive mobile.
8. Cadastrar avatar somente adicionando arquivos autorizados e editando o manifesto. Não usar associação visual como autenticação.

## Rollback

Render: usar Rollback/Deploy de um build anterior nos dois serviços. Bases desta entrega:
servidor `662ca40f3f5cd8c75c7dd222823c64dbb36c3059`, client `191b7c8a52840c900a33bbbd37e313f9035420c0`.
Para rollback versionado, reverter os commits novos em ordem inversa, em vez de apagar o histórico.
Não apagar nenhum objeto R2, banco ou variável de credencial. Replays existentes permanecem no
mesmo prefixo; snapshots de teams ficam guardados e voltam a ser acessíveis ao restaurar o adapter.
O client antigo volta às limitações de compartilhamento anteriores; o servidor antigo não aplica Sleep Clause.

## Arquivos modificados

### Servidor

- `COPA-RINHA-TEAMS.md`
- `config/custom-formats.ts`
- `data/mods/coparinha/README.md`
- `server/chat-plugins/teams.ts`
- `server/copa-teams.ts`
- `server/sockets.ts`
- `test/server/copa-teams.js`
- `test/sim/othermetas/coparinha-sleep.js`
- `test/sim/othermetas/coparinha.js`

### Client

- `COPA-RINHA-FINAL.md`
- `COPA-RINHA-IDENTITY.md`
- `play.pokemonshowdown.com/assets/copa-rinha/avatars.json`
- `play.pokemonshowdown.com/assets/copa-rinha/avatars/README.md`
- `play.pokemonshowdown.com/copa-rinha.html`
- `play.pokemonshowdown.com/index.html`
- `play.pokemonshowdown.com/replay.html`
- `play.pokemonshowdown.com/src/battle-animations.ts`
- `play.pokemonshowdown.com/src/battle-dex.ts`
- `play.pokemonshowdown.com/src/client-endload.ts`
- `play.pokemonshowdown.com/src/client-main.ts`
- `play.pokemonshowdown.com/src/copa-avatars.ts`
- `play.pokemonshowdown.com/src/copa-replay.ts`
- `play.pokemonshowdown.com/src/copa-rinha.ts`
- `play.pokemonshowdown.com/src/copa-team-import.ts`
- `play.pokemonshowdown.com/src/copa-team.ts`
- `play.pokemonshowdown.com/src/panel-mainmenu.tsx`
- `play.pokemonshowdown.com/src/panel-popups.tsx`
- `play.pokemonshowdown.com/src/panel-teambuilder-team.tsx`
- `play.pokemonshowdown.com/src/panel-topbar.tsx`
- `play.pokemonshowdown.com/style/copa-replay.css`
- `play.pokemonshowdown.com/style/copa-rinha.css`
- `play.pokemonshowdown.com/style/copa-team.css`
- `play.pokemonshowdown.com/team.html`
- `play.pokemonshowdown.com/testclient-new.html`
- `test/browser/copa-client.cjs`
- `test/browser/copa-team.cjs`
- `test/copa-rinha-avatars.test.js`
- `test/copa-rinha-local-names.test.js`
- `test/copa-single-format.test.js`
- `test/copa-team-sharing.test.js`
- `test/copa-team.test.js`
