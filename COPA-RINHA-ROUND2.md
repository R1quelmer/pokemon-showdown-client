# Copa Rinha II — segunda rodada

Branch `feat/copa-rinha-gimmick-ui`. Alterações anteriores preservadas. Somente
commits locais: não houve push, deploy ou mudança de infraestrutura nesta tarefa.
O relatório do servidor em `COPA-RINHA-ROUND2.md` explica persistência, proteção de
identidades e a ativação administrativa futura. `COPA-RINHA-IDENTITY.md` mantém os
detalhes da conta Copa e dos avatares locais.

## Implementação

- Conta exclusiva Copa: senha própria, registro permanente, sessão de 30 dias,
  retomada após reload/navegação/reconexão, múltiplas abas e saída com revogação.
  Senha/bearer não transitam no protocolo de chat. Senhas nunca são armazenadas no
  browser. Somente o token opaco de sessão fica no localStorage da origem Copa.
- `/copa-admin.html`: chave mantida apenas em memória, reservas em lote,
  desativação/reativação e emissão de recuperação. `/copa-conta.html`: código
  administrativo descartável e nova senha. Riquelme reservado no backend.
  Avisos explícitos: contas somente da Copa; não reutilizar senhas do Showdown.
- Logo no client usa navegação nativa `PS.join('')`, sem recarregar nem encerrar
  conexão/batalhas. href de fallback `/copa-rinha.html`. Replays abre uma aba nova
  preservando a batalha original. Voltar de páginas independentes recupera o
  token e reconecta, sem perder identidade (essas páginas não mantêm WebSocket).
  Teambuilder, perfil e desafio continuam nas rotas nativas. Nenhuma configuração
  visual/autenticação é aplicada fora da entrada Copa.
- Tokens já revogados são descartados no 401. Logout também permite limpar uma
  sessão que o servidor já invalidou. Falhas temporárias de rede/R2 preservam o
  token para tentar recuperar depois, sem tratar 503 como logout confirmado.
- Contador clicável e roster a cada 15 s: jogadores dos dois clients, visitantes
  agregados, status, em batalha, avatares nativos/customizados e perfil/desafio
  nativos. Avatares numéricos também são reconhecidos. Imagem indisponível deixa
  uma inicial; nenhum dado privado é exibido. Offline/timeout invalida snapshot.
- Aba Times compartilhados removida. Não se criou catálogo, busca ou enumeração
  de times. Teambuilder/share, URLs individuais, copiar/importar e R2 preservados.
- `/replay.html` sem ID agora é a central pública: jogadores/data/formato/vencedor,
  filtro por nickname exato normalizado, mais recentes primeiro, páginas de 20,
  assistir e copiar link. Formulário de link/ID continua disponível. Sem iframe,
  upload oficial ou mudança no Battle player. Botão Abrir replay usa o ciano e os
  controles/tipografia da página de times. Estados de vazio, erro e retry.
- Privados/não listados/legados sem visibilidade confirmada não aparecem. O bucket
  fica privado. Backend usa índice de metadados, sem varrer todos os logs por acesso.
  A central pode estar vazia até haver batalhas públicas com visibilidade gravada.
  Reindexação de objetos explicitamente públicos é manutenção opcional, não foi
  executada em produção. Nunca deduzir publicidade dos logs de replays antigos.
- Pastes mantêm o export clássico nativo sem duplicações: GIF Z-A custom primeiro,
  BW animado disponível depois, animação nativa mais nova se não houver BW e PNG
  se o GIF falhar/estiver ausente. Resolução preserva forma, gênero e shiny; falha
  de shiny não usa sprite normal. Nenhum código de sprites do Battle foi alterado.
  Os 74 GIFs, créditos e hashes Z-A continuam intactos.

## Verificação

Comandos principais:

```sh
node build full --no-update
npm test
npx eslint test/browser/copa-replay-library.cjs test/browser/copa-accounts.cjs test/browser/copa-presence.cjs test/browser/copa-sprite-assets.cjs test/browser/copa-team.cjs --max-warnings 0
CHROMIUM_PATH=/usr/bin/chromium node test/browser/copa-client.cjs
CHROMIUM_PATH=/usr/bin/chromium node test/browser/copa-replay.cjs
CHROMIUM_PATH=/usr/bin/chromium node test/browser/copa-za-sprites.cjs
CHROMIUM_PATH=/usr/bin/chromium node test/browser/copa-format.cjs
node test/browser/copa-nicknames.cjs
node test/browser/copa-accounts.cjs
node test/browser/copa-presence.cjs
node test/browser/copa-team.cjs
node test/browser/copa-replay-library.cjs
```

- Build completo usa o checkout atual preservado do servidor, sem atualizar branch.
  Inclui dados, índices, learnsets e tradução. O passo opcional de notícias avisa
  falta de PHP; o build termina com sucesso. Metadados de animação padrão continuam
  carregados do CDN oficial, como já ocorre no client; os GIFs Z-A são locais.
- Suite completa: 207 testes passaram, 1 skip, nenhum teste falhou. Inclui TypeScript,
  build-tools TypeScript e ESLint sem avisos. O skip é da própria suíte existente.
- Chromium: 1440/1000/390/320 px, sem overflow horizontal; paste com seis builds,
  imagens decodificadas, BW prioritário, fallback PNG após falha forçada de GIF,
  resolução de forma/fêmea/shiny e manutenção do export/copiar/importar.
- Contas: registro/login, senha errada/colisão, logo sem reload, retorno de time e
  replay, reload/reconexão, duas abas/um usuário, browser fechado/reaberto com sessão
  persistida, zero online após fechar, logout/revogação, 401 e admin protegido.
- Central: descoberta, filtro/paginação, dedup, copiar/assistir, formulário antigo,
  vazio/erro/retry, conteúdo malicioso como texto e layout responsivo.
- Roster: usuários/visitantes, avatares carregados inclusive numéricos, em batalha,
  perfil/desafio nativos, reconexão, timeout, background e privacidade.
- Replays: player nativo, controles, forfeit, troca dupla de perspectiva e mobile.
  Chromium decodificou os 74 GIFs Z-A com dimensões originais. Formato nativo nos
  clients moderno/legado e fluxo Teambuilder/share também passaram.

São testes locais: API/WS usam fixtures isoladas; imagens padrão usam bytes reais
verificados por hashes de Git de fonte pública. Render responde 403 neste ambiente;
o CDN oficial também é bloqueado. Não houve login real em psim.us nem acesso ao R2
de produção. Contas/CAS/scrypt/identidades/heartbeat são testados no código real do
servidor com stores/transportes isolados e sockets de loopback, não no Render.
Não declarar aprovação de persistência ou autenticação em produção por esses testes.

## Publicação e retorno

Não executados. Revisar commits e auto-deploy, publicar client primeiro e servidor
depois, apenas após aprovação. Manter os comandos de Render atuais e publicar
`play.pokemonshowdown.com`. No servidor será necessário um novo segredo
`COPA_RINHA_ADMIN_KEY`; não está criado nem exposto aqui. Confirmar políticas R2
para armazenamento permanente antes de ativar as contas, conforme relatório server.
Validar no Render contas, reinício, duas abas, fechamento, psim.us oficial,
share privado, replays públicos/privados/antigos e duas perspectivas.

Rollback client: versão publicada anterior
`26c020d0687cabde9274420a11cebf98761238ab`. Servidor:
`57c67d3616fff1429170661b0762abae977edb01`. Preservar objetos e aplicar o cuidado
com proteção dos novos nicknames ao voltar ao servidor antigo, descrito no relatório
server. Nenhuma reversão exige apagar times/replays/contas ou mudar o bucket.
