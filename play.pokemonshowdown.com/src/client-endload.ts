import { PS } from "./client-main";
import { Dex } from "./battle-dex";
import { CopaSharedTeams } from "./copa-team-import";

PS.libsLoaded.loaded();
window.CopaRinhaPresence?.start();
void Dex.loadTextData().then(() => PS.updateTranslatedText());

void CopaSharedTeams.importFromURL();
