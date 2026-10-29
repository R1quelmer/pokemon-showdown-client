Pokémon Showdown Client
========================================================================

Navigation: [Website][1] | [Server repository][2] | **Client repository** | [Dex repository][3]

  [1]: http://pokemonshowdown.com/
  [2]: https://github.com/smogon/pokemon-showdown
  [3]: https://github.com/Zarel/Pokemon-Showdown-Dex

Introduction
------------------------------------------------------------------------

This is a repository for most of the client code for Pokémon Showdown.

This is what runs `play.pokemonshowdown.com`.

**WARNING: You probably want the [Pokémon Showdown server][4]**, if you're
setting up a server.

  [4]: https://github.com/smogon/pokemon-showdown

Browser support
------------------------------------------------------------------------

Pokémon Showdown currently supports, in order of preference:

 - Chrome
 - Chromium browsers (Edge, Vivaldi, Brave, Opera...)
 - Firefox
 - Safari 5+
 - IE11+ and Edge
 - Chrome/Firefox/Safari for various mobile devices
 - any remotely modern browser

Pokémon Showdown is usable, but expect degraded performance and certain features not to work in extremely legacy browsers like:

 - Safari 4
 - IE9-10

Pokémon Showdown is mostly developed on Chrome, and Chrome or the desktop client is required for certain features like dragging-and-dropping teams from PS to your computer. However, bugs reported on any supported browser will usually be fixed pretty quickly.

New client
------------------------------------------------------------------------

Development is proceeding on the client rewrite! The live version is
available at https://play.pokemonshowdown.com/beta

Client testing requires a build step! Install the latest Node.js (we
require v22 or later) and Git, and run `node build` (on Windows) or `./build`
(on other OSes) to build after each change.

(This will do a fast build with no checks. For tests, linting, and
typechecking, you'll want to do `npm test` separately.)

You can make and test client changes simply by building after each change,
and opening `play.pokemonshowdown.com/testclient-new.html`. This will allow you
to test changes to the client without setting up your own login server.

### Test keys

For security reasons, browsers [don't let other websites control PS][5], so
they can't screw with your account, but it does make it harder to log in on
the test client.

If you need a logged-in account, add a `config/testclient-key.js` file, with
the contents:

    const POKEMON_SHOWDOWN_TESTCLIENT_KEY = 'sid';

Replace `sid` with the contents of your actual PS `sid` cookie. You can quickly
grab it from:

> https://play.pokemonshowdown.com/testclient-key.php

Make sure to put it in `config/` and not `play.pokemonshowdown.com/config/`.

  [5]: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

### Other servers

You can connect to an arbitrary server by navigating to
`testclient-new.html?~~host:port`. For example, to connect to a server running
locally on port 8000, you can navigate to `testclient-new.html?~~localhost:8000`.

Port 443 selects HTTPS/WSS; other ports use HTTP/WS. The same syntax works
with `testclient-old.html`.

**NOTE**: Certain browsers will convert `'?'` to `'%3F'` when reading files off
of the local filesystem. As a workaround, try using a different browser or
serving the files locally first (ie. run `npx http-server` from the
directory this README is in, then navigate in your browser to
`http://localhost:8080/testclient-new.html?~~localhost:8000`).

### Copa Rinha

On the Copa Rinha Static Site, open
<https://copa-rinha-client.onrender.com/copa-rinha.html>.
This shortcut opens the modern test client on the same site, connecting to
`copa-rinha-showdown.onrender.com` over HTTPS/WSS on port 443 with the
`/showdown` prefix. It does not change the default server of the other pages.

This entry offers **Escolher nome / Entrar** with only a nickname. The matching
Copa Rinha Render server enables `noguestsecurity`, so the client sends
`/trn NAME` without an assertion. Only a server-confirmed nickname is saved
locally and retried after reconnecting. No password is requested or stored;
this mode skips the test-client SID key and official account/login requests.
**Local nicknames are not secure authentication: someone who knows the
server can use a name when it is available.** If a name is in use, choose another.

The canonical format is `[Gen 9] [Copa Rinha] National Dex ZA`, ID
`gen9coparinhanationaldexza`. Existing locally saved teams using
`coparinhanationaldexza` or `gen6coparinhanationaldexza` are migrated to that
ID while keeping their names, folders and Pokemon data. The editor uses
unrestricted Gen 9 National Dex search tables; team legality and the four
mechanic limits remain the custom server's responsibility. This does not
make Copa Rinha inherit any official format's battle rules.

The Copa Rinha selectors also offer the 49 implemented Legends: Z-A Mega
formes and their 45 distinct Mega Stones. Their data already matches upstream
`ccfaa20f32af363569cd21a9d501b2bc1ded26b1`; the Copa-only search overlay exposes
these entries despite their upstream Future status, including required base
formes such as Floette-Eternal. Official format searches remain unchanged.
Names, stats, types, abilities, icons and existing sprite fallbacks reuse the
normal Showdown data. The server's `data/mods/coparinha/ZA.md` records the full
inventory and source comparison. Multiple stones in a team do not permit
more than one actual Mega Evolution per player.

Redeploy both the server's `feat/copa-rinha-national-dex-za` branch and the
client's `feat/copa-rinha-gimmick-ui` branch, server first. The public entry
URL above stays the same. Other client pages retain their normal login flow.

For the legacy client, use
<https://copa-rinha-client.onrender.com/testclient-old.html?~~copa-rinha-showdown.onrender.com:443>.

### Limitations

Even with a test key, the following things will fail in `testclient`:

+ Registering
+ Logging into other accounts (you can still switch to other unregistered
  accounts and back, though)

Everything else can be tested.

Warning
------------------------------------------------------------------------

This repository is not "batteries included". It does NOT include instructions
to run a full Pokémon Showdown login server, and we will not provide them.
Please do not ask for help on this; you will be turned away.

If you make a mistake hosting a login server, your users' passwords can get
stolen, so we do not want anyone to host a login server unless they can
figure out how to do it without help.

It also doesn't include several resource files (namely, the `/audio/` and
`/sprites/` directories) for size reasons.

On the other hand, as long as you don't want to run your own login server,
this repository contains everything you need to test changes to the client;
just see the "Testing" section above.

License
------------------------------------------------------------------------

Pokémon Showdown's client is distributed under the terms of the [AGPLv3][6].

The reason is mostly because I don't want low-effort proprietary forks that add bad code that steals everyone's passwords, or something like that.

If you're doing _anything_ else other than forking, _especially_ if you want to some client code files in your own open-source project that you want to release under a more permissive license (like, if you want to make your own multiplayer open-source game client for a different game), please ask at `staff@pokemonshowdown.com`. I hold all the copyright to the AGPLv3 parts and can relicense them to MIT for you.

  [6]: http://www.gnu.org/licenses/agpl-3.0.html

**WARNING:** This is **NOT** the same license as Pokémon Showdown's server.
