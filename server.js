/**
 * Live League of Legends tournament leaderboard.
 *
 * Start:
 *   npm install
 *   copy .env.example .env
 *   # put your Riot API key in .env
 *   npm start
 *
 * Open http://localhost:3000
 *
 * Riot ID participants are configured in TOURNAMENT_PLAYERS below.
 * The API key stays server-side and is never sent to the browser.
 */

const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_PLATFORM = (process.env.RIOT_PLATFORM || "la2").toLowerCase();
const RIOT_REGIONAL = (process.env.RIOT_REGIONAL || "americas").toLowerCase();

const MATCH_COUNT = Math.min(
  Math.max(Number(process.env.MATCH_COUNT || 20), 5),
  100
);

const CACHE_SECONDS = Math.min(
  Math.max(Number(process.env.CACHE_SECONDS || 60), 15),
  600
);

const DATA_DRAGON_FALLBACK = "16.16.1";

const SNAPSHOT_FILE = path.join(
  __dirname,
  "data",
  "leaderboard-snapshot.json"
);

const ACCOUNTS_FILE = path.join(
  __dirname,
  "data",
  "accounts.json"
);

const SESSIONS_FILE = path.join(
  __dirname,
  "data",
  "sessions.json"
);

const BLUE_SHELLS_FILE = path.join(
  __dirname,
  "data",
  "blue-shells.json"
);

const BLUE_SHELL_COOLDOWN =
  12 * 60 * 60 * 1000;  

  

// ============================================================
// PARTICIPANTES
// ============================================================

const TOURNAMENT_PLAYERS = [
  {
    gameName: "Bryanpro",
    tagLine: "007"
  },
  {
    gameName: "Batman Bugha",
    tagLine: "JCRG"
  }
];

// ============================================================
// EXPRESS
// ============================================================

app.use(express.static(__dirname));

// ============================================================
// CACHE
// ============================================================

const cache = new Map();
const matchCache = new Map();

let dataDragonVersion = DATA_DRAGON_FALLBACK;
let championCatalog = null;


async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(
      await fs.readFile(
        file,
        "utf8"
      )
    );
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file, data) {

  await fs.mkdir(
    path.dirname(file),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    file,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );
}
async function createSession(accountId) {

  const data =
    await readJsonFile(
      SESSIONS_FILE,
      {
        sessions: []
      }
    );

  const token =
    crypto.randomBytes(32).toString("hex");

  data.sessions.push({
    token,

    accountId,

    createdAt:
      Date.now(),

    expiresAt:
      Date.now() +
      7 * 24 * 60 * 60 * 1000
  });

  await writeJsonFile(
    SESSIONS_FILE,
    data
  );

  return token;
}

async function getAuthenticatedAccount(req) {

  const token =
    req.headers.authorization
      ?.replace(
        "Bearer ",
        ""
      );

  if (!token) {
    return null;
  }

  const sessions =
    await readJsonFile(
      SESSIONS_FILE,
      {
        sessions: []
      }
    );

  const session =
    sessions.sessions.find(
      s =>
        s.token === token &&
        s.expiresAt > Date.now()
    );

  if (!session) {
    return null;
  }

  const accounts =
    await readJsonFile(
      ACCOUNTS_FILE,
      {
        accounts: []
      }
    );

  return (
    accounts.accounts.find(
      account =>
        account.id ===
        session.accountId
    ) || null
  );
}

function verifyPassword(
  password,
  hash,
  salt
) {

  const calculated =
    crypto
      .scryptSync(
        password,
        salt,
        64
      )
      .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(calculated, "hex"),
    Buffer.from(hash, "hex")
  );
}
// ============================================================
// RIOT HOSTS
// ============================================================

function platformHost() {
  return `https://${RIOT_PLATFORM}.api.riotgames.com`;
}

function regionalHost() {
  return `https://${RIOT_REGIONAL}.api.riotgames.com`;
}

// ============================================================
// CACHE HELPERS
// ============================================================

function cacheGet(key) {
  const item = cache.get(key);

  if (!item || item.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function cacheSet(key, value, seconds = CACHE_SECONDS) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + seconds * 1000
  });

  return value;
}

// ============================================================
// RIOT API REQUEST
// ============================================================

async function riotGet(
  url,
  cacheKey = url,
  seconds = CACHE_SECONDS,
  endpointName = "UNKNOWN"
) {
  if (!RIOT_API_KEY) {
    console.error("[RIOT] ERROR: Falta RIOT_API_KEY en el archivo .env");

    throw new Error(
      "Falta RIOT_API_KEY en el archivo .env"
    );
  }

  const cached = cacheGet(cacheKey);

  if (cached) {
    console.log(`[${endpointName}] CACHE -> OK`);
    return cached;
  }

  console.log("");
  console.log("==================================================");
  console.log(`[${endpointName}] CONSULTANDO RIOT API`);
  console.log(`URL: ${url}`);
  console.log("==================================================");

  let response;

  try {
    response = await fetch(url, {
      headers: {
        "X-Riot-Token": RIOT_API_KEY,
        "Accept": "application/json"
      }
    });
  } catch (error) {
    console.error("");
    console.error("RIOT API CONNECTION ERROR");
    console.error(`ENDPOINT: ${endpointName}`);
    console.error(`URL: ${url}`);
    console.error(`ERROR: ${error.message}`);
    console.error("");

    throw new Error(
      `${endpointName}: Error de conexión con Riot API: ${error.message}`
    );
  }

  // ----------------------------------------------------------
  // RESPUESTA NO EXITOSA
  // ----------------------------------------------------------

  if (!response.ok) {
    const body = await response.text();

    console.error("");
    console.error("##################################################");
    console.error("             RIOT API ERROR");
    console.error("##################################################");
    console.error(`ENDPOINT: ${endpointName}`);
    console.error(`URL: ${url}`);
    console.error(`STATUS: ${response.status}`);
    console.error(`STATUS TEXT: ${response.statusText}`);
    console.error(`BODY: ${body.slice(0, 1000)}`);
    console.error("##################################################");
    console.error("");

    throw new Error(
      `${endpointName}: Riot API ${response.status}: ${body.slice(0, 300)}`
    );
  }

  // ----------------------------------------------------------
  // RESPUESTA EXITOSA
  // ----------------------------------------------------------

  console.log(`[${endpointName}] STATUS: ${response.status}`);
  console.log(`[${endpointName}] -> OK`);

  let data;

  try {
    data = await response.json();
  } catch (error) {
    console.error(
      `[${endpointName}] Error leyendo JSON: ${error.message}`
    );

    throw new Error(
      `${endpointName}: Riot devolvió una respuesta que no es JSON válido`
    );
  }

  return cacheSet(cacheKey, data, seconds);
}

// ============================================================
// DATA DRAGON
// ============================================================

async function getDataDragonVersion() {
  try {
    const response = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json"
    );

    const versions = await response.json();

    if (Array.isArray(versions) && versions[0]) {
      dataDragonVersion = versions[0];
    }
  } catch (error) {
    console.warn(
      "No se pudo consultar la versión de Data Dragon; usando",
      DATA_DRAGON_FALLBACK
    );
  }

  return dataDragonVersion;
}

async function getChampionCatalog() {
  if (championCatalog) {
    return championCatalog;
  }

  const version = await getDataDragonVersion();

  const url =
    `https://ddragon.leagueoflegends.com/cdn/` +
    `${version}/data/en_US/champion.json`;

  const response = await fetch(url);
  const data = await response.json();

  championCatalog = Object.values(data.data || {});

  return championCatalog;
}

function championKeyByName(name) {
  if (!name) return null;
  const normalized = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (Array.isArray(championCatalog)) {
    const match = championCatalog.find(ch => {
      const n=String(ch.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
      const i=String(ch.id||"").toLowerCase().replace(/[^a-z0-9]/g,"");
      return n===normalized||i===normalized;
    });
    if (match?.id) return match.id;
  }
  const fallback={monkeyking:"MonkeyKing",jarvaniv:"JarvanIV",leesin:"LeeSin",twistedfate:"TwistedFate",missfortune:"MissFortune",masteryi:"MasterYi",drmundo:"DrMundo",aurelionsol:"AurelionSol",reksai:"RekSai",ksante:"KSante",renataglasc:"Renata",belveth:"Belveth",chogath:"Chogath",khazix:"Khazix",velkoz:"Velkoz",tahmkench:"TahmKench",xinzhao:"XinZhao",kogmaw:"KogMaw",kaisa:"Kaisa",nunuandwillump:"Nunu"};
  return fallback[normalized]||String(name);
}

// ============================================================
// ACCOUNT-V1 + SUMMONER-V4
// ============================================================

async function getPlayerIdentity(gameName, tagLine) {
  const playerLabel = `${gameName}#${tagLine}`;

  console.log("");
  console.log("--------------------------------------------------");
  console.log(`[PLAYER] ${playerLabel}`);
  console.log("--------------------------------------------------");

  // ----------------------------------------------------------
  // ACCOUNT-V1
  // ----------------------------------------------------------

  console.log(`[ACCOUNT] Consultando ${playerLabel}...`);

  const accountUrl =
    `${regionalHost()}/riot/account/v1/accounts/by-riot-id/` +
    `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  let account;

  try {
    account = await riotGet(
      accountUrl,
      `account:${gameName}#${tagLine}`,
      600,
      "ACCOUNT-V1"
    );

    console.log(`[ACCOUNT] ${playerLabel} -> OK`);
  } catch (error) {
    console.error(
      `[ACCOUNT] ${playerLabel} -> ERROR`
    );

    throw error;
  }

  // ----------------------------------------------------------
  // SUMMONER-V4
  // ----------------------------------------------------------

  console.log(
    `[SUMMONER] Consultando ${playerLabel} por PUUID...`
  );

  const summonerUrl =
    `${platformHost()}/lol/summoner/v4/summoners/by-puuid/` +
    `${encodeURIComponent(account.puuid)}`;

  let summoner;

  try {
    summoner = await riotGet(
      summonerUrl,
      `summoner:${account.puuid}`,
      600,
      "SUMMONER-V4"
    );

    console.log(`[SUMMONER] ${playerLabel} -> OK`);

    // Diagnóstico para comprobar exactamente qué devuelve Riot.
    console.log(
      "[SUMMONER] Campos recibidos:",
      Object.keys(summoner)
    );

  } catch (error) {
    console.error(
      `[SUMMONER] ${playerLabel} -> ERROR`
    );

    throw error;
  }

  return {
    account,
    summoner
  };
}

// ============================================================
// LEAGUE-V4
// ============================================================

async function getSoloQueueEntry(summoner) {
  console.log("[LEAGUE] Consultando ranked...");

  if (!summoner) {
    throw new Error(
      "LEAGUE-V4: No se recibió información del invocador"
    );
  }

  /*
   * IMPORTANTE:
   *
   * El código anterior hacía:
   *
   *   getSoloQueueEntry(summoner.id)
   *
   * y terminaba enviando:
   *
   *   /by-summoner/undefined
   *
   * Ahora pasamos el objeto completo y comprobamos
   * qué identificadores tenemos antes de construir la URL.
   */

  console.log(
    "[LEAGUE] Datos del invocador recibidos:",
    Object.keys(summoner)
  );

  // ----------------------------------------------------------
  // PRIMERA OPCIÓN: PUUID
  // ----------------------------------------------------------

  if (summoner.puuid) {
    const puuidUrl =
      `${platformHost()}/lol/league/v4/entries/by-puuid/` +
      `${encodeURIComponent(summoner.puuid)}`;

    try {
      const entries = await riotGet(
        puuidUrl,
        `league-puuid:${summoner.puuid}`,
        60,
        "LEAGUE-V4-PUUID"
      );

      if (!Array.isArray(entries)) {
        throw new Error(
          "Riot no devolvió una lista de entradas de ranked"
        );
      }

      const soloQueue = entries.find(
        (entry) =>
          entry.queueType === "RANKED_SOLO_5x5"
      );

      if (soloQueue) {
        console.log(
          `[LEAGUE] Ranked encontrada: ` +
          `${soloQueue.tier} ${soloQueue.rank} ` +
          `(${soloQueue.leaguePoints} LP)`
        );
      } else {
        console.log(
          "[LEAGUE] No se encontró una entrada RANKED_SOLO_5x5"
        );
      }

      return soloQueue || null;

    } catch (error) {
      console.warn(
        "[LEAGUE] Endpoint por PUUID falló:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // SEGUNDA OPCIÓN: SUMMONER ID
  // ----------------------------------------------------------

  if (!summoner.id) {
    throw new Error(
      "LEAGUE-V4: Riot no proporcionó summoner.id y el endpoint por PUUID no funcionó"
    );
  }

  console.log(
    "[LEAGUE] Usando summoner.id:",
    summoner.id
  );

  const url =
    `${platformHost()}/lol/league/v4/entries/by-summoner/` +
    `${encodeURIComponent(summoner.id)}`;

  try {
    const entries = await riotGet(
      url,
      `league:${summoner.id}`,
      60,
      "LEAGUE-V4-SUMMONER-ID"
    );

    if (!Array.isArray(entries)) {
      throw new Error(
        "Riot no devolvió una lista de entradas de ranked"
      );
    }

    const soloQueue = entries.find(
      (entry) =>
        entry.queueType === "RANKED_SOLO_5x5"
    );

    if (soloQueue) {
      console.log(
        `[LEAGUE] Ranked encontrada: ` +
        `${soloQueue.tier} ${soloQueue.rank} ` +
        `(${soloQueue.leaguePoints} LP)`
      );
    } else {
      console.log(
        "[LEAGUE] No se encontró una entrada RANKED_SOLO_5x5"
      );
    }

    return soloQueue || null;

  } catch (error) {
    console.error("[LEAGUE] ERROR");
    throw error;
  }
}

// ============================================================
// MATCH-V5
// ============================================================

async function getRecentRankedMatches(puuid) {
  console.log("[MATCH] Consultando historial de partidas...");

  const idsUrl =
    `${regionalHost()}/lol/match/v5/matches/by-puuid/` +
    `${encodeURIComponent(puuid)}/ids` +
    `?start=0&count=${MATCH_COUNT}`;

  let ids;

  try {
    ids = await riotGet(
      idsUrl,
      `match-ids:${puuid}:${MATCH_COUNT}`,
      60,
      "MATCH-V5-ID-LIST"
    );
  } catch (error) {
    console.error(
      "[MATCH] Error obteniendo IDs de partidas"
    );

    throw error;
  }

  console.log(
    `[MATCH] Riot devolvió ${ids.length} IDs de partidas`
  );

  const results = [];

  for (const matchId of ids) {
    const cached = matchCache.get(matchId);

    if (cached) {
      results.push(cached);
      continue;
    }

    try {
      const matchUrl =
        `${regionalHost()}/lol/match/v5/matches/` +
        `${encodeURIComponent(matchId)}`;

      const match = await riotGet(
        matchUrl,
        `match:${matchId}`,
        300,
        "MATCH-V5-DETAIL"
      );

      matchCache.set(matchId, match);

      results.push(match);

    } catch (error) {
      console.warn(
        `[MATCH] No se pudo leer ${matchId}:`,
        error.message
      );
    }
  }

  const rankedMatches = results.filter(
    (match) =>
      match?.info?.queueId === 420
  );

  console.log(
    `[MATCH] Partidas Ranked Solo encontradas: ` +
    `${rankedMatches.length}`
  );

  return rankedMatches;
}

// ============================================================
// CAMPEÓN MÁS JUGADO
// ============================================================

function aggregateMostPlayedChampion(matches, puuid) {
  const stats = new Map();

  for (const match of matches) {
    // Cada match pertenece al historial del jugador, pero buscamos
    // explícitamente su participante para evitar usar una variable
    // inexistente y para contar únicamente sus campeones.
    const participant =
      match?.info?.participants?.find(
        (p) => p.puuid === puuid
      );

    if (!participant || !participant.championName) {
      continue;
    }

    const name = participant.championName;

    const current = stats.get(name) || {
      name,
      games: 0,
      wins: 0
    };

    current.games += 1;

    if (participant.win) {
      current.wins += 1;
    }

    stats.set(name, current);
  }

  const mostPlayed =
    [...stats.values()]
      .sort((a, b) => {
        if (b.games !== a.games) {
          return b.games - a.games;
        }

        return b.wins - a.wins;
      })[0];

  if (!mostPlayed) {
    return null;
  }

  return {
    name: mostPlayed.name,
    games: mostPlayed.games,
    wins: mostPlayed.wins,
    winrate:
      (mostPlayed.wins / mostPlayed.games) * 100,
    key: championKeyByName(mostPlayed.name)
  };
}

// ============================================================
// JUGADOR COMPLETO
// ============================================================

async function getPlayer(playerConfig) {
  const {
    gameName,
    tagLine
  } = playerConfig;

  const playerLabel =
    `${gameName}#${tagLine}`;

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    `PROCESANDO JUGADOR: ${playerLabel}`
  );
  console.log(
    "=================================================="
  );

  const {
    account,
    summoner
  } =
    await getPlayerIdentity(
      gameName,
      tagLine
    );

  // IMPORTANTE:
  // Antes se enviaba summoner.id.
  // Ahora enviamos el objeto completo.
  await getChampionCatalog();

  const solo =
    await getSoloQueueEntry(
      summoner
    );

  const matches =
    await getRecentRankedMatches(
      account.puuid
    );

  const mostPlayedChampion =
    aggregateMostPlayedChampion(
      matches,
      account.puuid
    );
    const version = await getDataDragonVersion();

  if (!solo) {
    console.log(
      `[PLAYER] ${playerLabel} -> UNRANKED`
    );

    return {
      gameName,
      tagLine,
      puuid: account.puuid,

      summonerId:
        summoner.id || null,

      profileIconId:
        summoner.profileIconId,

      dataDragonVersion: version,

      tier: "UNRANKED",
      rank: "",
      leaguePoints: 0,

      wins: 0,
      losses: 0,

      trend: 0,

      mostPlayedChampion,
      recentRankedGames:
        matches.length
    };
  }

  console.log(
    `[PLAYER] ${playerLabel} -> ` +
    `${solo.tier} ${solo.rank} ` +
    `${solo.leaguePoints} LP`
  );

  return {
    gameName,
    tagLine,

    puuid: account.puuid,

    summonerId:
      summoner.id || null,

    profileIconId:
      summoner.profileIconId,

    dataDragonVersion: version,

    tier: solo.tier,
    rank: solo.rank,
    leaguePoints:
      solo.leaguePoints,

    wins: solo.wins,
    losses: solo.losses,

    trend: 0,

    mostPlayedChampion,
    recentRankedGames:
      matches.length
  };
}

// ============================================================
// SNAPSHOT
// ============================================================

async function readSnapshot() {
  try {
    return JSON.parse(
      await fs.readFile(
        SNAPSHOT_FILE,
        "utf8"
      )
    );
  } catch {
    return {
      positions: {}
    };
  }
}

async function writeSnapshot(players) {
  await fs.mkdir(
    path.dirname(SNAPSHOT_FILE),
    {
      recursive: true
    }
  );

  const positions = {};

  players.forEach(
    (player, index) => {
      positions[
        `${player.gameName}#${player.tagLine}`
      ] = index + 1;
    }
  );

  await fs.writeFile(
    SNAPSHOT_FILE,
    JSON.stringify(
      { positions },
      null,
      2
    ),
    "utf8"
  );
}

// ============================================================
// TENDENCIAS
// ============================================================

function applyTrends(
  players,
  previousPositions
) {
  return players.map(
    (player, index) => {
      const key =
        `${player.gameName}#${player.tagLine}`;

      const previous =
        previousPositions[key];

      const current =
        index + 1;

      if (
        !previous ||
        previous === current
      ) {
        return {
          ...player,
          trend: 0
        };
      }

      return {
        ...player,
        trend:
          previous - current
      };
    }
  );
}

// ============================================================
// SISTEMA DE CLASIFICACIÓN POR ELO + LP
// ============================================================

const TIER_ORDER = {
  IRON: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  EMERALD: 6,
  DIAMOND: 7,
  MASTER: 8,
  GRANDMASTER: 9,
  CHALLENGER: 10
};

const DIVISION_ORDER = {
  IV: 1,
  III: 2,
  II: 3,
  I: 4
};

function getTierValue(tier) {
  return TIER_ORDER[
    String(tier || "")
      .toUpperCase()
      .trim()
  ] || 0;
}

function getDivisionValue(rank) {
  return DIVISION_ORDER[
    String(rank || "")
      .toUpperCase()
      .trim()
  ] || 0;
}

function isHighElo(tier) {
  const normalized =
    String(tier || "")
      .toUpperCase()
      .trim();

  return (
    normalized === "MASTER" ||
    normalized === "GRANDMASTER" ||
    normalized === "CHALLENGER"
  );
}

/**
 * Orden de clasificación:
 *
 * 1. ELO/TIER
 * 2. División
 * 3. LP
 * 4. Victorias
 * 5. Menos derrotas
 */
function comparePlayers(a, b) {

  const tierA =
    getTierValue(a.tier);

  const tierB =
    getTierValue(b.tier);

  // ----------------------------------------------------------
  // 1. ELO
  // ----------------------------------------------------------

  if (tierA !== tierB) {
    return tierB - tierA;
  }

  // ----------------------------------------------------------
  // 2. DIVISIÓN
  //
  // I > II > III > IV
  //
  // Solo aplica a rangos que tienen divisiones.
  // ----------------------------------------------------------

  if (!isHighElo(a.tier)) {

    const divisionA =
      getDivisionValue(a.rank);

    const divisionB =
      getDivisionValue(b.rank);

    if (divisionA !== divisionB) {
      return divisionB - divisionA;
    }
  }

  // ----------------------------------------------------------
  // 3. LP
  // ----------------------------------------------------------

  const lpA =
    Number(a.leaguePoints) || 0;

  const lpB =
    Number(b.leaguePoints) || 0;

  if (lpA !== lpB) {
    return lpB - lpA;
  }

  // ----------------------------------------------------------
  // 4. VICTORIAS
  // ----------------------------------------------------------

  const winsA =
    Number(a.wins) || 0;

  const winsB =
    Number(b.wins) || 0;

  if (winsA !== winsB) {
    return winsB - winsA;
  }

  // ----------------------------------------------------------
  // 5. MENOS DERROTAS
  // ----------------------------------------------------------

  const lossesA =
    Number(a.losses) || 0;

  const lossesB =
    Number(b.losses) || 0;

  return lossesA - lossesB;
}

// ============================================================
// LEADERBOARD
// ============================================================

let leaderboardCache = null;
let leaderboardExpiresAt = 0;
let refreshPromise = null;

async function buildLeaderboard() {
  if (
    leaderboardCache &&
    leaderboardExpiresAt >
      Date.now()
  ) {
    return leaderboardCache;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise =
    (async () => {
      const previous =
        await readSnapshot();

      const players = [];
      const errors = [];

      console.log("");
      console.log("");
      console.log(
        "##################################################"
      );
      console.log(
        "        ACTUALIZANDO LEADERBOARD"
      );
      console.log(
        "##################################################"
      );

      for (
        const config of
          TOURNAMENT_PLAYERS
      ) {
        const playerLabel =
          `${config.gameName}#${config.tagLine}`;

        try {
          console.log("");
          console.log(
            `>>> INICIANDO ${playerLabel}`
          );

          const player =
            await getPlayer(
              config
            );

          players.push(player);

          console.log(
            `>>> ${playerLabel} COMPLETADO`
          );

        } catch (error) {
          console.error("");
          console.error(
            `>>> ERROR EN ${playerLabel}`
          );

          console.error(
            `>>> ${error.message}`
          );

          errors.push({
            ...config,
            error:
              error.message
          });
        }
      }

     players.sort(comparePlayers);

      const withTrends =
        applyTrends(
          players,
          previous.positions ||
            {}
        );

      await writeSnapshot(
        withTrends
      );

      const totalRankedGamesAnalyzed =
        withTrends.reduce(
          (sum, player) =>
            sum +
            player.recentRankedGames,
          0
        );

      const version =
        await getDataDragonVersion();

      leaderboardCache = {
        updatedAt:
          new Date().toISOString(),

        matches:
          totalRankedGamesAnalyzed,

        dataSource:
          "Riot Games API",

        dataDragonVersion:
          version,

        errors,

        players:
          withTrends
      };

      leaderboardExpiresAt =
        Date.now() +
        CACHE_SECONDS * 1000;

      console.log("");
      console.log(
        "##################################################"
      );
      console.log(
        "        LEADERBOARD ACTUALIZADO"
      );
      console.log(
        "##################################################"
      );

      console.log(
        `Jugadores correctos: ${players.length}`
      );

      console.log(
        `Errores: ${errors.length}`
      );

      console.log(
        "##################################################"
      );

      console.log("");

      return leaderboardCache;
    })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ============================================================
// API HISTORIAL DE JUGADOR
// ============================================================

app.get(
  "/api/player/:gameName/:tagLine/history",
  async (req, res) => {

    try {

      const gameName =
        decodeURIComponent(
          req.params.gameName
        );

      const tagLine =
        decodeURIComponent(
          req.params.tagLine
        );

      console.log(
        `[PLAYER HISTORY] ${gameName}#${tagLine}`
      );

      const identity =
        await getPlayerIdentity(
          gameName,
          tagLine
        );

      const puuid =
        identity.account.puuid;

      const summoner =
        identity.summoner;

      const solo =
        await getSoloQueueEntry(
          summoner
        );

      const matches =
        await getRecentRankedMatches(
          puuid
        );

      const playerMatches =
        matches
          .map(match => {

            const participant =
              match.info.participants.find(
                p => p.puuid === puuid
              );

            if (!participant) {
              return null;
            }

            const duration =
              match.info.gameDuration || 0;

            const minutes =
              Math.floor(
                duration / 60
              );

            const seconds =
              duration % 60;

            return {

              matchId:
                match.metadata.matchId,

              timestamp:
                match.info.gameStartTimestamp,

              gameDuration:
                duration,

              durationText:
                `${minutes}:${String(seconds).padStart(2, "0")}`,

              win:
                Boolean(
                  participant.win
                ),

              champion:
                participant.championName,

              championKey:
                championKeyByName(
                  participant.championName
                ),

              kills:
                participant.kills || 0,

              deaths:
                participant.deaths || 0,

              assists:
                participant.assists || 0,

              kda:
                participant.deaths === 0
                  ? (
                      participant.kills +
                      participant.assists
                    ).toFixed(2)
                  : (
                      (
                        participant.kills +
                        participant.assists
                      ) /
                      participant.deaths
                    ).toFixed(2),

              cs:
                (
                  participant.totalMinionsKilled ||
                  0
                ) +
                (
                  participant.neutralMinionsKilled ||
                  0
                ),

              gold:
                participant.goldEarned ||
                0,

              visionScore:
                participant.visionScore ||
                0,

              role:
                participant.teamPosition ||
                participant.role ||
                "UNKNOWN",

              items: [
                participant.item0,
                participant.item1,
                participant.item2,
                participant.item3,
                participant.item4,
                participant.item5,
                participant.item6
              ].filter(
                item =>
                  Number(item) > 0
              ),

              summonerSpells: [
                participant.summoner1Id,
                participant.summoner2Id
              ],

              teamId:
                participant.teamId

            };

          })
          .filter(Boolean);


      // --------------------------------------------------------
      // ESTADÍSTICAS GENERALES
      // --------------------------------------------------------

      const totalGames =
        playerMatches.length;

      const wins =
        playerMatches.filter(
          m => m.win
        ).length;

      const losses =
        totalGames - wins;

      const winrate =
        totalGames
          ? (wins / totalGames) * 100
          : 0;


      const totalKills =
        playerMatches.reduce(
          (sum, m) =>
            sum + m.kills,
          0
        );

      const totalDeaths =
        playerMatches.reduce(
          (sum, m) =>
            sum + m.deaths,
          0
        );

      const totalAssists =
        playerMatches.reduce(
          (sum, m) =>
            sum + m.assists,
          0
        );

      const totalCs =
        playerMatches.reduce(
          (sum, m) =>
            sum + m.cs,
          0
        );


      const averageKda =
        totalGames
          ? (
              (
                totalKills +
                totalAssists
              ) /
              Math.max(
                totalDeaths,
                1
              )
            )
          : 0;


      const averageCs =
        totalGames
          ? totalCs / totalGames
          : 0;


      // --------------------------------------------------------
      // CAMPEONES
      // --------------------------------------------------------

      const championMap =
        new Map();


      for (
        const match
        of playerMatches
      ) {

        const current =
          championMap.get(
            match.champion
          ) || {

            name:
              match.champion,

            key:
              match.championKey,

            games:
              0,

            wins:
              0,

            kills:
              0,

            deaths:
              0,

            assists:
              0

          };


        current.games++;

        if (match.win) {
          current.wins++;
        }

        current.kills +=
          match.kills;

        current.deaths +=
          match.deaths;

        current.assists +=
          match.assists;


        championMap.set(
          match.champion,
          current
        );

      }


      const champions =
        [...championMap.values()]
          .map(c => ({

            ...c,

            winrate:
              c.games
                ? (
                    c.wins /
                    c.games
                  ) * 100
                : 0,

            kda:
              c.deaths === 0
                ? (
                    c.kills +
                    c.assists
                  )
                : (
                    (
                      c.kills +
                      c.assists
                    ) /
                    c.deaths
                  )

          }))
          .sort(
            (a, b) =>
              b.games -
              a.games
          );


      // --------------------------------------------------------
      // RESPUESTA
      // --------------------------------------------------------

      res.json({

        player: {

          gameName,

          tagLine,

          puuid,

          profileIconId:
            summoner.profileIconId,

          tier:
            solo?.tier ||
            "UNRANKED",

          rank:
            solo?.rank ||
            "",

          leaguePoints:
            solo?.leaguePoints ||
            0,

          wins:
            solo?.wins ||
            wins,

          losses:
            solo?.losses ||
            losses

        },


        statistics: {

          games:
            totalGames,

          wins,

          losses,

          winrate,

          averageKda,

          averageCs,

          averageKills:
            totalGames
              ? totalKills /
                totalGames
              : 0,

          averageDeaths:
            totalGames
              ? totalDeaths /
                totalGames
              : 0,

          averageAssists:
            totalGames
              ? totalAssists /
                totalGames
              : 0

        },


        champions,

        matches:
          playerMatches,

        dataDragonVersion:
          dataDragonVersion

      });

    } catch (error) {

      console.error(
        "[PLAYER HISTORY ERROR]",
        error
      );

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


// ============================================================
// API DETALLE DE PARTIDA
// ============================================================

app.get(
  "/api/match/:matchId",
  async (req, res) => {

    try {

      const matchId =
        req.params.matchId;

      console.log(
        `[MATCH DETAIL] ${matchId}`
      );


      let match =
        matchCache.get(
          matchId
        );


      if (!match) {

        const matchUrl =
          `${regionalHost()}/lol/match/v5/matches/` +
          `${encodeURIComponent(matchId)}`;


        match =
          await riotGet(
            matchUrl,
            `match:${matchId}`,
            300,
            "MATCH-V5-DETAIL"
          );


        matchCache.set(
          matchId,
          match
        );

      }


      // --------------------------------------------------------
      // EQUIPOS
      // --------------------------------------------------------

      const teams =
        match.info.teams.map(
          team => ({

            teamId:
              team.teamId,

            win:
              team.win,

            objectives:
              team.objectives

          })
        );


      // --------------------------------------------------------
      // PARTICIPANTES
      // --------------------------------------------------------

      const participants =
        match.info.participants.map(
          p => ({

            puuid:
              p.puuid,

            gameName:
              p.riotIdGameName ||
              p.summonerName ||
              "Jugador",

            tagLine:
              p.riotIdTagline ||
              "",

            champion:
              p.championName,

            championKey:
              championKeyByName(
                p.championName
              ),

            teamId:
              p.teamId,

            profileIconId:
              p.profileIcon,

            win:
              p.win,

            kills:
              p.kills,

            deaths:
              p.deaths,

            assists:
              p.assists,

            cs:
              (
                p.totalMinionsKilled ||
                0
              ) +
              (
                p.neutralMinionsKilled ||
                0
              ),

            gold:
              p.goldEarned,

            visionScore:
              p.visionScore,

            damage:
              p.totalDamageDealtToChampions || 0,

            role:
              p.teamPosition ||
              p.role ||
              "",

            items: [
              p.item0,
              p.item1,
              p.item2,
              p.item3,
              p.item4,
              p.item5,
              p.item6
            ].filter(
              item =>
                Number(item) > 0
            ),

            summonerSpells: [
              p.summoner1Id,
              p.summoner2Id
            ],

            perks: {
              styles:
                p.perks?.styles || [],
              statPerks:
                p.perks?.statPerks || {}
            }

          })
        );


      res.json({

        matchId,

        gameStartTimestamp:
          match.info.gameStartTimestamp,

        gameDuration:
          match.info.gameDuration,

        queueId:
          match.info.queueId,

        gameMode:
          match.info.gameMode,

        teams,

        participants,

        dataDragonVersion:
          dataDragonVersion

      });

    } catch (error) {

      console.error(
        "[MATCH DETAIL ERROR]",
        error
      );

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

// ============================================================
// AUTENTICACIÓN
// ============================================================

app.use(
  express.json()
);

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const {
        username,
        password
      } = req.body;

      if (!username || !password) {

        return res.status(400).json({
          error:
            "Usuario y contraseña son obligatorios."
        });

      }

      const data =
        await readJsonFile(
          ACCOUNTS_FILE,
          {
            accounts: []
          }
        );

      const account =
        data.accounts.find(
          account =>
            account.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (!account) {

        return res.status(401).json({
          error:
            "Usuario o contraseña incorrectos."
        });

      }

      const valid =
        verifyPassword(
          password,
          account.passwordHash,
          account.passwordSalt
        );

      if (!valid) {

        return res.status(401).json({
          error:
            "Usuario o contraseña incorrectos."
        });

      }

      const token =
        await createSession(
          account.id
        );

      res.json({

        success:
          true,

        token,

        user: {
          username:
            account.username,

          participantId:
            account.participantId,

          gameName:
            account.gameName,

          tagLine:
            account.tagLine
        }

      });

    } catch (error) {

      console.error(
        "[LOGIN ERROR]",
        error
      );

      res.status(500).json({
        error:
          "Error interno del servidor."
      });

    }
  }
);

app.get(
  "/api/auth/me",
  async (req, res) => {

    try {

      const account =
        await getAuthenticatedAccount(
          req
        );

      if (!account) {

        return res.status(401).json({
          authenticated:
            false
        });

      }

      res.json({

        authenticated:
          true,

        user: {
          username:
            account.username,

          participantId:
            account.participantId,

          gameName:
            account.gameName,

          tagLine:
            account.tagLine
        }

      });

    } catch (error) {

      res.status(500).json({
        error:
          error.message
      });

    }
  }
);

const BLUE_SHELL_CHALLENGES = {

  easy: [

    {
      id: "no_flash",
      title: "🚫 Sin Flash",
      description:
        "No puedes utilizar Flash durante toda la partida."
    },

    {
      id: "no_wards",
      title: "👁️ Sin wards",
      description:
        "No puedes comprar wards durante la partida."
    },

    {
      id: "one_recall",
      title: "🏠 Un solo back",
      description:
        "Solo puedes regresar voluntariamente a base una vez."
    }

  ],

  medium: [

    {
      id: "no_back",
      title: "🏠 Prohibido backear",
      description:
        "No puedes regresar voluntariamente a base. Solo puedes hacerlo después de morir."
    },

    {
      id: "no_boots",
      title: "🥾 Sin botas",
      description:
        "No puedes comprar botas durante la partida."
    },

    {
      id: "random_first_item",
      title: "🛒 Primer objeto",
      description:
        "Debes comprar como primer objeto el objeto indicado por la ruleta."
    }

  ],

  hard: [

    {
      id: "random_champion",
      title: "🎲 Campeón aleatorio",
      description:
        "Debes jugar con el campeón seleccionado por la ruleta."
    },

    {
      id: "random_runes",
      title: "📜 Runas aleatorias",
      description:
        "Debes utilizar las runas seleccionadas por la ruleta."
    },

    {
      id: "no_flash_no_back",
      title: "💀 Sin Flash + sin back",
      description:
        "No puedes utilizar Flash y tampoco puedes regresar voluntariamente a base."
    }

  ]

};

function randomItem(array) {

  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ];

}

function createBlueShellChallenge(
  selectedColor
) {

  const correctColor =
    Math.random() < 0.5
      ? "blue"
      : "red";

  const correct =
    selectedColor ===
    correctColor;

  let difficulty;

  if (correct) {

    difficulty =
      Math.random() < 0.5
        ? "easy"
        : "medium";

  } else {

    difficulty =
      Math.random() < 0.5
        ? "medium"
        : "hard";

  }

  const challenge =
    randomItem(
      BLUE_SHELL_CHALLENGES[
        difficulty
      ]
    );

  return {

    selectedColor,

    correctColor,

    correct,

    difficulty,

    challenge

  };
}

app.post(
  "/api/blue-shell/send",
  async (req, res) => {

    try {

      const sender =
        await getAuthenticatedAccount(
          req
        );

      if (!sender) {

        return res.status(401).json({
          error:
            "Debes iniciar sesión."
        });

      }

      const {
        targetParticipantId,
        selectedColor
      } = req.body;

      if (
        !targetParticipantId ||
        !selectedColor
      ) {

        return res.status(400).json({
          error:
            "Faltan datos."
        });

      }

      if (
        selectedColor !== "blue" &&
        selectedColor !== "red"
      ) {

        return res.status(400).json({
          error:
            "Color inválido."
        });

      }

      if (
        sender.participantId ===
        targetParticipantId
      ) {

        return res.status(400).json({
          error:
            "No puedes enviarte una Blue Shell a ti mismo."
        });

      }

      // ------------------------------------------------------
      // COOLDOWN
      // ------------------------------------------------------

      if (
        sender.blueShellLastSentAt
      ) {

        const lastSent =
          new Date(
            sender.blueShellLastSentAt
          ).getTime();

        const elapsed =
          Date.now() -
          lastSent;

        if (
          elapsed <
          BLUE_SHELL_COOLDOWN
        ) {

          const remaining =
            BLUE_SHELL_COOLDOWN -
            elapsed;

          return res.status(429).json({

            error:
              "Todavía no puedes enviar otra Blue Shell.",

            remainingMs:
              remaining,

            remainingMinutes:
              Math.ceil(
                remaining /
                60000
              )

          });

        }

      }

      // ------------------------------------------------------
      // COMPROBAR OBJETIVO
      // ------------------------------------------------------

      const accounts =
        await readJsonFile(
          ACCOUNTS_FILE,
          {
            accounts: []
          }
        );

      const target =
        accounts.accounts.find(
          account =>
            account.participantId ===
            targetParticipantId
        );

      if (!target) {

        return res.status(404).json({
          error:
            "Participante no encontrado."
        });

      }

      // ------------------------------------------------------
      // CREAR RETO
      // ------------------------------------------------------

      const result =
        createBlueShellChallenge(
          selectedColor
        );

      const shell = {

        id:
          crypto.randomUUID(),

        senderParticipantId:
          sender.participantId,

        senderName:
          sender.gameName,

        targetParticipantId:
          target.participantId,

        targetName:
          target.gameName,

        selectedColor,

        correctColor:
          result.correctColor,

        correct:
          result.correct,

        difficulty:
          result.difficulty,

        challenge:
          result.challenge,

        createdAt:
          new Date().toISOString()

      };

      // ------------------------------------------------------
      // GUARDAR BLUE SHELL
      // ------------------------------------------------------

      const shells =
        await readJsonFile(
          BLUE_SHELLS_FILE,
          {
            shells: []
          }
        );

      shells.shells.push(
        shell
      );

      await writeJsonFile(
        BLUE_SHELLS_FILE,
        shells
      );

      // ------------------------------------------------------
      // ACTUALIZAR COOLDOWN
      // ------------------------------------------------------

      const accountIndex =
        accounts.accounts.findIndex(
          account =>
            account.id ===
            sender.id
        );

      accounts.accounts[
        accountIndex
      ].blueShellLastSentAt =
        new Date().toISOString();

      await writeJsonFile(
        ACCOUNTS_FILE,
        accounts
      );

      res.json({

        success:
          true,

        shell: {

          id:
            shell.id,

          targetName:
            shell.targetName,

          selectedColor:
            shell.selectedColor,

          correctColor:
            shell.correctColor,

          correct:
            shell.correct,

          difficulty:
            shell.difficulty,

          challenge:
            shell.challenge

        }

      });

    } catch (error) {

      console.error(
        "[BLUE SHELL ERROR]",
        error
      );

      res.status(500).json({
        error:
          error.message
      });

    }
  }
);

app.get(
  "/api/blue-shell/status",
  async (req, res) => {

    try {

      const account =
        await getAuthenticatedAccount(
          req
        );

      if (!account) {

        return res.status(401).json({
          error:
            "Debes iniciar sesión."
        });

      }

      if (
        !account.blueShellLastSentAt
      ) {

        return res.json({
          available:
            true,

          remainingMs:
            0
        });

      }

      const elapsed =
        Date.now() -
        new Date(
          account.blueShellLastSentAt
        ).getTime();

      const remaining =
        Math.max(
          0,
          BLUE_SHELL_COOLDOWN -
          elapsed
        );

      res.json({

        available:
          remaining === 0,

        remainingMs:
          remaining

      });

    } catch (error) {

      res.status(500).json({
        error:
          error.message
      });

    }
  }
);

app.get(
  "/api/blue-shell/incoming",
  async (req, res) => {

    try {

      const account =
        await getAuthenticatedAccount(
          req
        );

      if (!account) {

        return res.status(401).json({
          error:
            "Debes iniciar sesión."
        });

      }

      const data =
        await readJsonFile(
          BLUE_SHELLS_FILE,
          {
            shells: []
          }
        );

      const incoming =
        data.shells.filter(
          shell =>
            shell.targetParticipantId ===
            account.participantId
        );

      res.json({
        shells:
          incoming
      });

    } catch (error) {

      res.status(500).json({
        error:
          error.message
      });

    }

  }
);

// ============================================================
// API LEADERBOARD
// ============================================================

app.get(
  "/api/leaderboard",
  async (_req, res) => {
    try {
      const data =
        await buildLeaderboard();

      res.json(data);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// API HEALTH
// ============================================================

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      ok: true,

      riotKeyConfigured:
        Boolean(
          RIOT_API_KEY
        ),

      riotPlatform:
        RIOT_PLATFORM,

      riotRegional:
        RIOT_REGIONAL,

      matchCount:
        MATCH_COUNT,

      cacheSeconds:
        CACHE_SECONDS,

      participants:
        TOURNAMENT_PLAYERS.map(
          (player) => ({
            gameName:
              player.gameName,

            tagLine:
              player.tagLine
          })
        ),

      endpoints: {
        account:
          `${regionalHost()}/riot/account/v1/accounts/by-riot-id/.../...`,

        summoner:
          `${platformHost()}/lol/summoner/v4/summoners/by-puuid/...`,

        league:
          `${platformHost()}/lol/league/v4/entries/by-puuid/...`,

        match:
          `${regionalHost()}/lol/match/v5/matches/by-puuid/...`
      },

      apiKeyExposed:
        false
    });
  }
);

// ============================================================
// SERVER
// ============================================================

app.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "=================================================="
    );
    console.log(
      "       LOL TOURNAMENT SERVER"
    );
    console.log(
      "=================================================="
    );

    console.log(
      `Servidor: http://localhost:${PORT}`
    );

    console.log(
      `Plataforma Riot: ${RIOT_PLATFORM}`
    );

    console.log(
      `Región Riot: ${RIOT_REGIONAL}`
    );

    console.log(
      `API Key configurada: ${Boolean(
        RIOT_API_KEY
      )}`
    );

    console.log(
      `Participantes: ${TOURNAMENT_PLAYERS
        .map(
          (p) =>
            `${p.gameName}#${p.tagLine}`
        )
        .join(", ")}`
    );

    console.log(
      "API Key: [OCULTA]"
    );

    console.log(
      "=================================================="
    );

    console.log("");
  }
);