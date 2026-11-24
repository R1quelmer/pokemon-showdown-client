# Apelidos e avatares locais da Copa Rinha

## Identificação local, sem contas novas

A entrada Copa mantém a camada `CopaRinhaLocalNames` já existente. Ela usa o
comando nativo `/trn NOME` com o modo de nomes locais já habilitado no servidor.
Não cria conta, senha, token, assertion, OAuth, endpoint ou serviço de identidade.
Não depende de autorização da Smogon ou do loginserver oficial. Essa alteração
não afeta a autenticação do client oficial `*.psim.us`.

O nickname é guardado no localStorage desta origem, com uma chave que inclui
host, porta e prefixo do servidor, e somente após confirmação do servidor.
Cada novo `challstr` provoca uma nova tentativa de restauração do nome confirmado.
Uma resposta de nome ocupado ou timeout permite escolher outro. Delimitadores do
protocolo e caracteres de controle são rejeitados antes do comando.

Nomes locais **não são contas oficialmente autenticadas**. O client zera o marcador
`registered` tanto ao iniciar a identificação quanto ao processar suas confirmações.
A interface explica essa limitação no seletor de nickname e nas configurações.
Rotas nativas de registro/troca de senha também mostram a identificação local,
sem campos de senha, quando abertas diretamente no modo Copa.

Nenhum apelido novo foi reservado a uma pessoa. Quem souber um nome poderá usá-lo
quando disponível. Use os canais administrativos existentes do torneio para
conferir a pessoa; nome, cor e avatar nunca constituem prova de identidade.
Não foi criado mecanismo alternativo de autenticação para tentar solucionar isso.
Os dados de times do navegador não são apagados nem movidos.

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
