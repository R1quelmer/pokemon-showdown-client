# Contas e avatares locais da Copa Rinha

## Contas exclusivas da Copa Rinha

O client usa contas próprias com senha, separadas das contas oficiais do Showdown.
Não reutilize a senha do Showdown ou de outros sites. Não há OAuth, loginserver
Smogon nem dependência PostgreSQL no fluxo local. O fluxo oficial do psim.us
continua usando a verificação nativa de assertions; credenciais locais nunca
marcam um usuário como oficialmente registrado ou concedem seus privilégios.

Nicknames registrados são permanentes. As senhas usam scrypt N=32768, r=8, p=3,
salt aleatório de16bytes e derivação de64bytes. Aceitam10–128caracteres. O servidor
limita tentativas por nickname e origem de conexão, além de limitar derivações
simultâneas. A API não retorna hashes de senha ou segredos de outros usuários.

Sessões usam32bytes aleatórios e validade absoluta de30dias; apenas SHA-256 do
token é gravado. O token opaco fica no localStorage da origem do client; senhas
nunca são persistidas pelo app. A API recebe credenciais por HTTPS POST, com
respostas no-store. No WebSocket, o marcador público /trn NOME,0,copa consome uma
concessão descartável de30segundos vinculada ao desafio aleatório daquela conexão.
Nenhuma senha, bearer token ou código de recuperação é enviado no chat/protocolo.

Duas abas que provam a posse da mesma conta usam o merge nativo de User e aparecem
uma única vez online. Sessões gravadas no R2 não mantêm User conectado. Fechar a
última conexão remove a presença; reabrir o navegador recupera a identidade com
o token válido. A logo navega internamente sem recarregar a página/conexão.
Sair revoga a sessão no servidor, remove o token e desconecta as abas da origem.
Revogações administrativas/expiração também são verificadas nas conexões locais
a cada30segundos. A falha de armazenamento não concede novas identidades.

Riquelme começa reservado e precisa de ativação administrativa. Não foi atribuída
senha inicial nem criado um token real nesta implementação.

## Administração e recuperação

Página /copa-admin.html: listar contas, reservar/remover reservas em lote,
desativar/reativar contas e emitir recuperação. Contas registradas não são liberadas
por expiração de sessão; desativá-las também não libera o nickname. A página exige
chave administrativa própria e não grava essa chave no navegador. A lista de
sessões válidas é explicitamente separada da lista de usuários online.

Antes de um deploy aprovado, o administrador deve configurar no servidor a variável
COPA_RINHA_ADMIN_KEY com um segredo aleatório de pelo menos32bytes, codificado em
base64url (43caracteres), fora do Git. Sem a variável, a administração nega acesso.
Não enviar o valor em chat, logs ou URLs. Nenhuma variável foi criada/alterada
neste ambiente nem no Render por esta implementação.

Para ativar Riquelme: entrar na administração, escolher Emitir recuperação para uma
conta, informar Riquelme e entregar o código por canal privado ao titular validado.
Na página /copa-conta.html, o titular informa o código e define uma senha própria.
O código vale24horas, só pode ser usado uma vez e substituí-lo invalida o anterior.
A recuperação revoga as sessões antigas. Não precisa alterar código ou redeploy
para gerenciar outros participantes, inclusive reservas em lote de até100nomes.

## Persistência privada

Registro único copa-accounts/v1/registry.json no bucket R2 privado já configurado,
usando as quatro variáveis R2 existentes. Escritas condicionais ETag/IfMatch e
IfNoneMatch evitam sobrescrever alterações concorrentes entre processos. A
expiração remove sessões/concessões/códigos; nunca remove os registros de contas.
O registro tem limites de tamanho/capacidade para a Copa:2MiB, até1000contas no
registro público e4096sessões simultaneamente válidas.

IMPORTANTE antes de publicar: o prefixo copa-accounts/ deve ficar fora de regras de
lifecycle que apaguem replays temporários. Manter backup/versionamento privado do
registro. Não tornar o bucket público. Nenhum objeto R2 real, regra de lifecycle,
credencial, replay ou time existente foi alterado por estes testes locais.

## Cadastro administrativo de avatares

A infraestrutura está pronta e o manifesto inicial é **vazio**. Nenhuma imagem,
participante, associação ou identidade foi inventada.

Arquivos:

- `play.pokemonshowdown.com/assets/copa-rinha/avatars.json`: manifesto administrativo.
- `play.pokemonshowdown.com/assets/copa-rinha/avatars/`: PNG, GIF ou WebP locais.
- `play.pokemonshowdown.com/src/copa-avatars.ts`: validação e carregamento opcional.

Formato do manifesto (os placeholders abaixo são somente documentação):

```json
{
  "version": 1,
  "avatars": {
    "id-da-imagem": { "file": "arquivo-autorizado.png" }
  },
  "participants": {
    "idnormalizadodonome": "id-da-imagem"
  }
}
```

O ID de participante é o nickname em letras minúsculas/números, sem espaços ou
pontuação, igual ao `toID` do Showdown. Para cadastrar um participante real:

1. Obtenha a imagem autorizada e coloque-a no diretório local de avatares.
2. Insira um ID de imagem e seu nome de arquivo no manifesto.
3. Associe o ID normalizado do participante ao ID da imagem.
4. Rode build/testes, publique somente após autorização e recarregue a aba.

A associação vale apenas no client próprio em modo Copa. O client oficial não
recebe esse arquivo ou comandos de avatar adicionais. Não há sincronização de
avatar ou prova de conta oficial.

O manifesto aceita até 64 imagens e 256 associações. Nomes de arquivos não podem
ter URL, barras, parâmetros, fragmentos, percent-encoding, SVG ou `..`. IDs são
validados e só podem referenciar entradas explícitas. Os arquivos são carregados
da mesma origem, sem cookies/credentials no fetch do manifesto. Uma imagem só
entra no mapa após carregar corretamente com dimensões naturais maiores que zero.

Se o manifesto falhar, o arquivo não existir, o participante não estiver associado
ou o client estiver fora da Copa, `Dex.resolveAvatar()` usa integralmente seu
comportamento anterior. Os avatares padrão e caminhos custom nativos continuam
funcionando. Nenhuma alteração foi feita em `Dex.getSpriteData()` ou nos 74 GIFs.

O nome do participante é passado opcionalmente ao resolvedor nos popups modernos
e no renderer nativo de treinadores de batalha. O renderer recebe apenas a URL
local; posicionamento, perspectiva e protocolo permanecem nativos.
O helper é opcional: páginas que não o carregam, inclusive o replay independente,
continuam usando o avatar recebido pelo protocolo como antes.

## Validação

Os testes de nicknames cobrem nome confirmado, restauração/reconexão, colisão,
timeout, armazenamento e falta de conexão; as regressões adicionais impedem
herdar estado de conta oficial e exibir campos de conta/senha no modo local.
Os testes de avatares usam somente identidades/arquivos sintéticos em memória:
manifesto vazio, paths inválidos, falta de imagem/manifesto, isolamento fora da
Copa, carregamento único, associação exata e fallback do resolvedor nativo.
Nenhuma credencial real ou endpoint de autenticação é necessário para esses testes.

## Administração e ativação após aprovação

A interface é `/copa-admin.html`. A API permanece fechada até configurar no
servidor a variável NOVA `COPA_RINHA_ADMIN_KEY` com pelo menos32bytes gerados
aleatoriamente e codificados em base64url (43caracteres). Não é uma senha de
participante nem uma credencial R2; nunca deve entrar no repositório ou no build
do client. Gere e guarde essa chave em um gerenciador de segredos sob seu controle.
Nenhuma variável foi criada ou alterada nesta implementação local.

Ao publicar futuramente, configure essa chave apenas no serviço do servidor e
revise o lifecycle do prefixo privado `copa-accounts/`. O restante usa as quatro
variáveis R2 já existentes. Não há migration PostgreSQL. A criação inicial do
registro reserva somente `Riquelme`; isso não escreve no bucket antes do primeiro
uso real após a publicação.

No painel, informe a chave administrativa e escolha: listar; reservar até100
nicknames por operação; liberar reservas ainda sem senha; desativar/reativar
contas; ou emitir recuperação para um titular validado. Não é necessário editar
código ou publicar novamente para essas operações. Contas registradas nunca são
liberadas por expiração de sessão ou por remover uma reserva.

Para ativar `Riquelme`, o administrador emite recuperação e entrega o código
privadamente ao titular verificado. O participante abre `/copa-conta.html`, informa
o código e define sua própria senha Copa. O código vale24horas e é de uso único.
Emitir recuperação suspende o login anterior e revoga as sessões; definir a nova
senha reativa a conta. A chave do administrador fica somente na memória do painel.

Sair revoga o token corrente e encerra as abas que compartilham essa sessão.
Outros dispositivos com sessões diferentes permanecem até saírem ou até o
administrador revogar/desativar a conta. A invalidação local encerra conexões
correspondentes imediatamente; uma verificação a cada30segundos também aplica
expiração/revogação entre instâncias. Fechar o navegador não revoga o token,
mas fecha as conexões e remove a presença online. Sessão persistente não mantém
um jogador artificialmente conectado.
