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
