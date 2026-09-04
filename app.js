// ============================================================
// SOLOQ CHALLENGE - APP.JS
// ============================================================

const API_BASE = "";
const TOURNAMENT_TARGET = "2026-09-02T00:00:00-05:00";

let currentPlayer = null;
let currentMatch = null;

let runeCatalog = null;
let runeCatalogPromise = null;

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("es-PE");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatTime(timestamp) {
  if (!timestamp) return "--:--";

  return new Date(timestamp).toLocaleTimeString(
    "es-PE",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function getDDragonBase(version) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}`;
}

function championImage(version, championKey) {
  if (!version || !championKey) return "";
  const key=String(championKey).trim();
  if (!key) return "";
  return `${getDDragonBase(version)}/img/champion/${encodeURIComponent(key)}.png`;
}

function profileImage(version, iconId) {
  if (!iconId) {
    return "";
  }

  return `${getDDragonBase(version)}/img/profileicon/${iconId}.png`;
}

function itemImage(version, itemId) {
  if (!itemId) {
    return "";
  }

  return `${getDDragonBase(version)}/img/item/${itemId}.png`;
}

// ============================================================
// RUNAS
// ============================================================

async function loadRuneCatalog(version) {
  if (runeCatalog) {
    return runeCatalog;
  }

  if (runeCatalogPromise) {
    return runeCatalogPromise;
  }

  runeCatalogPromise =
    fetch(
      `${getDDragonBase(version)}/data/en_US/runesReforged.json`
    )
      .then(response => {
        if (!response.ok) {
          throw new Error(
            "No se pudo cargar el catálogo de runas"
          );
        }

        return response.json();
      })
      .then(data => {

        const map = new Map();

        for (const style of data) {

          map.set(
            style.id,
            {
              id: style.id,
              name: style.name,
              icon: style.icon
            }
          );

          for (const slot of style.slots || []) {

            for (const rune of slot.runes || []) {

              map.set(
                rune.id,
                {
                  id: rune.id,
                  name: rune.name,
                  icon: rune.icon,
                  longDesc:
                    rune.longDesc || "",
                  shortDesc:
                    rune.shortDesc || "",
                  styleId:
                    style.id,
                  styleName:
                    style.name
                }
              );

            }

          }
        }

        runeCatalog = map;

        return map;
      })
      .catch(error => {

        console.warn(
          "[RUNES]",
          error
        );

        runeCatalog = new Map();

        return runeCatalog;
      });

  return runeCatalogPromise;
}

function runeImage(version, rune) {
  if (!rune || !rune.icon) {
    return "";
  }

  // Si ya es una URL completa
  if (rune.icon.startsWith("http")) {
    return rune.icon;
  }

  // Corrige la ruta de Data Dragon
  const iconPath = String(rune.icon).replace(/^\/+/, "");

  return `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
}

function getRuneSelections(participant, catalog) {

  const styles = participant.perks?.styles || [];

  const primary =
    styles.find(style => style.description === "primaryStyle");

  const secondary =
    styles.find(style => style.description === "subStyle");

  const primaryRunes = (primary?.selections || [])
    .map(selection => catalog.get(selection.perk))
    .filter(Boolean);

  const secondaryRunes = (secondary?.selections || [])
    .map(selection => catalog.get(selection.perk))
    .filter(Boolean);

  return {
    primaryTree: primary ? catalog.get(primary.style) || null : null,
    secondaryTree: secondary ? catalog.get(secondary.style) || null : null,
    primaryRunes,
    secondaryRunes
  };
}

function renderRuneIcon(version, rune, extraClass = "") {
  if (!rune) return "";

  return `
    <img
      class="mini-rune-icon ${extraClass}"
      src="${runeImage(version, rune)}"
      alt="${escapeHtml(rune.name)}"
      title="${escapeHtml(rune.name)}"
      loading="lazy"
    >
  `;
}

// ============================================================
// LEADERBOARD
// ============================================================

async function loadLeaderboard() {

  const response =
    await fetch(
      `${API_BASE}/api/leaderboard`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      "No se pudo cargar el leaderboard"
    );
  }

  return response.json();
}

function renderLeaderboard(data) {

  const body =
    document.getElementById(
      "standingsBody"
    );

  if (!body) return;

  const players =
    data.players || [];

  const version =
    data.dataDragonVersion;

  body.innerHTML =
    players.map(
      (player, index) => {

        const position =
          index + 1;

        let positionClass =
          "pos-num";

        if (position === 1)
          positionClass += " gold";

        if (position === 2)
          positionClass += " silver";

        if (position === 3)
          positionClass += " bronze";

        const games =
          Number(player.wins || 0) +
          Number(player.losses || 0);

        const winrate =
          games
            ? (player.wins / games) * 100
            : 0;

        let trendHtml =
          `<span class="trend flat">
            <span class="trend-arrow">•</span>
            -
          </span>`;

        if (player.trend > 0) {
          trendHtml =
            `<span class="trend up">
              <span class="trend-arrow">▲</span>
              ${player.trend}
            </span>`;
        }

        if (player.trend < 0) {
          trendHtml =
            `<span class="trend down">
              <span class="trend-arrow">▼</span>
              ${Math.abs(player.trend)}
            </span>`;
        }

        return `
          <tr
            class="${position === 1 ? "leader-row" : ""}"
            data-player="${escapeHtml(player.gameName)}"
            data-tag="${escapeHtml(player.tagLine)}"
          >

            <td class="col-pos">
              <div class="${positionClass}">
                ${position}
              </div>
            </td>

            <td class="col-summoner">

              <div class="player-cell">

                <img
                  class="profile-icon"
                  src="${profileImage(
                    version,
                    player.profileIconId
                  )}"
                  alt=""
                  loading="lazy"
                >

                <div>

                  <div class="player-name">
                    ${escapeHtml(
                      player.gameName
                    )}
                  </div>

                  <div class="tag">
                    #${escapeHtml(
                      player.tagLine
                    )}
                  </div>

                </div>

              </div>

            </td>

            <td class="col-tag">
              <span class="tag">
                #${escapeHtml(
                  player.tagLine
                )}
              </span>
            </td>

            <td class="col-elo">
              <span class="elo">
                ${escapeHtml(
                  player.tier
                )}
                ${
                  player.rank
                    ? ` ${escapeHtml(player.rank)}`
                    : ""
                }
              </span>
            </td>

            <td class="col-lp">
              <span class="lp">
                ${formatNumber(
                  player.leaguePoints
                )} LP
              </span>
            </td>

            <td class="col-wins">
              ${player.wins || 0}
            </td>

            <td class="col-losses">
              ${player.losses || 0}
            </td>

            <td class="col-winrate">
              ${formatPercent(winrate)}
            </td>

            <td class="col-trend">
              ${trendHtml}
            </td>

          </tr>
        `;
      }
    ).join("");

  document
    .getElementById("playersCount")
    ?.replaceChildren(
      document.createTextNode(
        players.length
      )
    );

  document
    .getElementById("matchesCount")
    ?.replaceChildren(
      document.createTextNode(
        formatNumber(
          data.matches || 0
        )
      )
    );

  updateLeader(
    players[0],
    version
  );

  attachPlayerClicks();
}

function updateLeader(
  player,
  version
) {

  if (!player) return;

  const name =
    document.getElementById(
      "leaderName"
    );

  const tag =
    document.getElementById(
      "leaderTag"
    );

  const rank =
    document.getElementById(
      "leaderRank"
    );

  const lp =
    document.getElementById(
      "leaderLp"
    );

  const championName =
    document.getElementById(
      "leaderChampionName"
    );

  const championMeta =
    document.getElementById(
      "leaderChampionMeta"
    );

  const championImageElement =
  document.getElementById(
    "leaderChampionImage"
  );

  if (name)
    name.textContent =
      player.gameName;

  if (tag)
    tag.textContent =
      `#${player.tagLine}`;

  if (rank)
    rank.textContent =
      `${player.tier} ${player.rank || ""}`.trim();

  if (lp)
    lp.textContent =
      `${player.leaguePoints || 0} LP`;

  const champion =
    player.mostPlayedChampion;

  if (champion) {

    championName.textContent =
      champion.name;

    championMeta.textContent =
      `${champion.games} PARTIDAS (${formatPercent(
        champion.winrate
      )} WINRATE)`;

    if (champion.key) {

      championImageElement.src =
  championImage(
    version,
    champion.key
  );

    }
  }
}

// ============================================================
// CLICK JUGADOR
// ============================================================

function attachPlayerClicks() {

  document
    .querySelectorAll(
      "#standingsBody tr"
    )
    .forEach(row => {

      row.style.cursor =
        "pointer";

      row.addEventListener(
        "click",
        () => {

          const gameName =
            row.dataset.player;

          const tagLine =
            row.dataset.tag;

          showPlayerProfile(
            gameName,
            tagLine
          );

        }
      );

    });
}

// ============================================================
// PERFIL
// ============================================================

async function showPlayerProfile(
  gameName,
  tagLine
) {

  const leaderboard =
    document.getElementById(
      "clasificacion"
    );

  const profile =
    document.getElementById(
      "playerProfile"
    );

  const standings =
    document.querySelector(
      ".standings-card"
    );

  const summary =
    document.querySelector(
      ".summary-grid"
    );

  const legal =
    document.querySelector(
      ".legal-card"
    );

  if (!profile) return;

  profile.hidden = false;

  const prizes = document.getElementById("premios");
  if (prizes) prizes.hidden = true;

  document.querySelectorAll(".main-nav a[data-nav]").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === "clasificacion");
  });

  leaderboard.style.display =
    "none";

  standings.style.display =
    "none";

  summary.style.display =
    "none";

  legal.style.display =
    "none";

  profile.scrollIntoView({
    behavior: "smooth"
  });

  try {

    const response =
      await fetch(
        `/api/player/${encodeURIComponent(
          gameName
        )}/${encodeURIComponent(
          tagLine
        )}/history`,
        {
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Error cargando jugador"
      );
    }

    currentPlayer =
      data;

    renderProfile(data);

  } catch (error) {

    console.error(error);

    alert(
      "No se pudo cargar el perfil."
    );
  }
}

function renderProfile(data) {

  const player =
    data.player;

  const stats =
    data.statistics;

  const version =
    data.dataDragonVersion;

  document.getElementById(
    "profileName"
  ).textContent =
    player.gameName;

  document.getElementById(
    "profileTag"
  ).textContent =
    `#${player.tagLine}`;

  document.getElementById(
    "profileRank"
  ).textContent =
    `${player.tier} ${player.rank || ""}`.trim();

  document.getElementById(
    "profileLp"
  ).textContent =
    `${player.leaguePoints || 0} LP`;

  document.getElementById(
    "profileIcon"
  ).src =
    profileImage(
      version,
      player.profileIconId
    );

  document.getElementById(
    "profileWins"
  ).textContent =
    stats.wins;

  document.getElementById(
    "profileLosses"
  ).textContent =
    stats.losses;

  document.getElementById(
    "profileWinrate"
  ).textContent =
    formatPercent(
      stats.winrate
    );

  document.getElementById(
    "profileGames"
  ).textContent =
    stats.games;

  document.getElementById(
    "profileKda"
  ).textContent =
    Number(
      stats.averageKda || 0
    ).toFixed(2);

  document.getElementById(
    "profileCs"
  ).textContent =
    Number(
      stats.averageCs || 0
    ).toFixed(1);

  renderProfileAnalysis(
    data
  );

  renderChampionStats(
    data.champions || [],
    version
  );

  renderMatchHistory(
    data.matches || [],
    version
  );
}

function renderProfileAnalysis(data) {

  const stats =
    data.statistics;

  let title =
    "ANÁLISIS GENERAL";

  let text =
    "Rendimiento equilibrado en las partidas analizadas.";

  if (stats.winrate >= 60) {

    title =
      "RENDIMIENTO DESTACADO";

    text =
      `El jugador mantiene un ${formatPercent(
        stats.winrate
      )} de victorias en las partidas analizadas, mostrando un rendimiento claramente positivo.`;

  } else if (stats.winrate < 40) {

    title =
      "ÁREA DE MEJORA";

    text =
      `El porcentaje de victorias se encuentra en ${formatPercent(
        stats.winrate
      )}. Conviene revisar las partidas perdidas para detectar patrones de juego repetidos.`;

  } else if (stats.averageKda >= 3) {

    title =
      "BUEN IMPACTO EN PELEAS";

    text =
      `El KDA promedio es de ${Number(
        stats.averageKda
      ).toFixed(2)}, indicando una participación sólida en los enfrentamientos.`;
  }

  document.getElementById(
    "profileAnalysisTitle"
  ).textContent =
    title;

  document.getElementById(
    "profileAnalysis"
  ).textContent =
    text;
}

function renderChampionStats(
  champions,
  version
) {

  const container =
    document.getElementById(
      "championStats"
    );

  if (!container) return;

  container.innerHTML =
    champions.map(
      champion => `
        <div class="champion-stat-card">

          <img
            src="${championImage(
              version,
              champion.key
            )}"
            alt="${escapeHtml(
              champion.name
            )}"
          >

          <div class="champion-stat-info">

            <strong>
              ${escapeHtml(
                champion.name
              )}
            </strong>

            <span>
              ${champion.games} partidas
            </span>

            <span>
              ${formatPercent(
                champion.winrate
              )} WR
            </span>

            <span>
              ${Number(
                champion.kda || 0
              ).toFixed(2)} KDA
            </span>

          </div>

        </div>
      `
    ).join("");
}

function renderMatchHistory(
  matches,
  version
) {

  const container =
    document.getElementById(
      "matchHistory"
    );

  if (!container) return;

  container.innerHTML =
    matches.map(
      match => `

        <div
          class="history-match ${
            match.win
              ? "history-win"
              : "history-loss"
          }"
          data-match-id="${escapeHtml(
            match.matchId
          )}"
        >

          <img
            class="history-champion"
            src="${championImage(
              version,
              match.championKey
            )}"
            alt=""
          >

          <div class="history-main">

            <strong>
              ${escapeHtml(
                match.champion
              )}
            </strong>

            <span>
              ${match.kills}
              /
              ${match.deaths}
              /
              ${match.assists}
            </span>

          </div>

          <div class="history-result">

            <strong>
              ${
                match.win
                  ? "VICTORIA"
                  : "DERROTA"
              }
            </strong>

            <span>
              ${match.durationText}
            </span>

          </div>

        </div>

      `
    ).join("");

  container
    .querySelectorAll(
      ".history-match"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        () => {

          showMatchDetails(
            element.dataset.matchId
          );

        }
      );

    });
}

// ============================================================
// DETALLE DE PARTIDA
// ============================================================

async function showMatchDetails(
  matchId
) {

  const profile =
    document.getElementById(
      "playerProfile"
    );

  const details =
    document.getElementById(
      "matchDetails"
    );

  if (!details) return;

  profile.hidden = true;
  details.hidden = false;

  const prizes = document.getElementById("premios");
  if (prizes) prizes.hidden = true;

  document.querySelectorAll(".main-nav a[data-nav]").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === "clasificacion");
  });

  details.scrollIntoView({
    behavior: "smooth"
  });

  try {

    const response =
      await fetch(
        `/api/match/${encodeURIComponent(
          matchId
        )}`,
        {
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Error obteniendo partida"
      );
    }

    currentMatch =
      data;

    await renderMatchDetails(
      data
    );

  } catch (error) {

    console.error(
      "[MATCH]",
      error
    );

    alert(
      "No se pudo cargar el detalle de la partida."
    );
  }
}

// ============================================================
// RENDER PARTIDA
// ============================================================

async function renderMatchDetails(
  match
) {

  const version =
    match.dataDragonVersion;

  const participants =
    match.participants || [];

  const duration =
    Number(
      match.gameDuration || 0
    );

  const minutes =
    Math.floor(
      duration / 60
    );

  const seconds =
    duration % 60;

  // El resultado se determina según el jugador seleccionado, no según
  // la existencia de cualquier ganador dentro de los 10 participantes.
  // Esto hace que tus partidas muestren correctamente VICTORIA/DERROTA.
  const focusPlayer = currentPlayer?.player?.puuid;

  const selected =
    participants.find(
      p => p.puuid === focusPlayer
    ) || participants[0];

  document.getElementById(
    "matchResult"
  ).textContent =
    selected?.win
      ? "VICTORIA"
      : "DERROTA";

  document.getElementById(
    "matchDuration"
  ).textContent =
    `${minutes}:${String(
      seconds
    ).padStart(2, "0")}`;

  if (selected) {

    document.getElementById(
      "matchChampionImage"
    ).src =
      championImage(
        version,
        selected.championKey
      );

    document.getElementById(
      "matchChampionName"
    ).textContent =
      selected.champion;

    document.getElementById(
      "matchKda"
    ).textContent =
      `${selected.kills} / ${selected.deaths} / ${selected.assists}`;

    document.getElementById(
      "matchKills"
    ).textContent =
      selected.kills;

    document.getElementById(
      "matchDeaths"
    ).textContent =
      selected.deaths;

    document.getElementById(
      "matchAssists"
    ).textContent =
      selected.assists;

    document.getElementById(
      "matchCs"
    ).textContent =
      selected.cs;

    document.getElementById(
      "matchGold"
    ).textContent =
      formatNumber(
        selected.gold
      );

    document.getElementById(
      "matchVision"
    ).textContent =
      selected.visionScore;
  }

  await renderTeams(
    participants,
    version
  );
}

async function renderTeams(
  participants,
  version
) {

  const winningTeam =
    document.getElementById(
      "winningTeam"
    );

  const losingTeam =
    document.getElementById(
      "losingTeam"
    );

  if (!winningTeam ||
      !losingTeam) {
    return;
  }

  const catalog =
    await loadRuneCatalog(
      version
    );

  const winning =
    participants.filter(
      p => p.win
    );

  const losing =
    participants.filter(
      p => !p.win
    );

  winningTeam.innerHTML =
    winning
      .map(
        player =>
          renderParticipantCard(
            player,
            participants,
            version,
            catalog
          )
      )
      .join("");

  losingTeam.innerHTML =
    losing
      .map(
        player =>
          renderParticipantCard(
            player,
            participants,
            version,
            catalog
          )
      )
      .join("");
}

// ============================================================
// TARJETA DE PARTICIPANTE
// ============================================================

function renderParticipantCard(
  player,
  allParticipants,
  version,
  catalog
) {

  const observations =
    generateObservations(
      player,
      allParticipants
    );

  const runes =
    getRuneSelections(
      player,
      catalog
    );

  const items =
    (player.items || [])
      .slice(0, 6)
      .map(
        id => `
          <img
            class="match-item-icon"
            src="${itemImage(
              version,
              id
            )}"
            alt="Objeto ${id}"
            title="Objeto ${id}"
          >
        `
      )
      .join("");

  const runeIconsHtml = [
    runes.primaryRunes[0],
    ...runes.primaryRunes.slice(1),
    ...runes.secondaryRunes
  ]
    .map((rune, index) =>
      renderRuneIcon(
        version,
        rune,
        index === 0 ? "primary-rune" : ""
      )
    )
    .join("");

  const runeTreesHtml = `
    ${renderRuneIcon(version, runes.primaryTree, "rune-tree-icon")}
    ${renderRuneIcon(version, runes.secondaryTree, "rune-tree-icon")}`;

  const observationsHtml =
    observations
      .map(
        observation => `
          <div
            class="match-observation ${observation.type}"
            title="${escapeHtml(
              observation.description
            )}"
          >

            <span class="observation-icon">
              ${observation.icon}
            </span>

            <span>
              ${escapeHtml(
                observation.title
              )}
            </span>

          </div>
        `
      )
      .join("");

  return `

    <div class="participant-card">

      <div class="participant-main">

        <div class="participant-avatar-wrapper">

          <img
            class="participant-icon"
            src="${profileImage(
              version,
              player.profileIconId
            )}"
            alt="${escapeHtml(
              player.gameName
            )}"
          >

          <div class="participant-runes">
            ${runeIconsHtml}
          </div>

        </div>

        <img
          class="participant-champion"
          src="${championImage(
            version,
            player.championKey
          )}"
          alt="${escapeHtml(
            player.champion
          )}"
        >

        <div class="participant-identity">

          <strong>
            ${escapeHtml(
              player.gameName
            )}
          </strong>

          <span>
            #${escapeHtml(
              player.tagLine
            )}
          </span>

          <small>
            ${escapeHtml(
              player.role || "UNKNOWN"
            )}
          </small>

        </div>

        <div class="participant-kda">

          <strong>
            ${player.kills}
            /
            ${player.deaths}
            /
            ${player.assists}
          </strong>

          <span>
            KDA
          </span>

        </div>

        <div class="participant-performance">

          <span>
            ${player.cs} CS
          </span>

          <span>
            ${formatNumber(
              player.gold
            )} oro
          </span>

          <span>
            ${player.visionScore} visión
          </span>

        </div>

      </div>

      ${
        observationsHtml
          ? `
            <div class="match-observations">
              ${observationsHtml}
            </div>
          `
          : ""
      }

      <div class="participant-loadout">

        <div class="participant-items">

          ${items || `
            <span class="empty-items">
              SIN OBJETOS
            </span>
          `}

        </div>

        <div class="participant-rune-summary">
          <span>RUNAS</span>
          <div class="rune-tree-icons">
            ${runeTreesHtml}
          </div>
        </div>

      </div>

    </div>

  `;
}

// ============================================================
// OBSERVACIONES
// ============================================================

function generateObservations(
  player,
  participants
) {

  const team =
    participants.filter(
      p =>
        p.teamId ===
        player.teamId
    );

  const teamKills =
    team.reduce(
      (sum, p) =>
        sum + Number(
          p.kills || 0
        ),
      0
    );

  const playerKP =
    teamKills > 0
      ? (
          (
            Number(player.kills || 0) +
            Number(player.assists || 0)
          ) /
          teamKills
        ) * 100
      : 0;

  const averageVision =
    average(
      team.map(
        p =>
          Number(
            p.visionScore || 0
          )
      )
    );

  const averageKP =
    average(
      team.map(
        p => {

          const kills =
            teamKills || 1;

          return (
            (
              Number(p.kills || 0) +
              Number(p.assists || 0)
            ) /
            kills
          ) * 100;

        }
      )
    );

  const averageDamage =
    average(
      team.map(
        p =>
          Number(
            p.damage || 0
          )
      )
    );

  const averageDeaths =
    average(
      team.map(
        p =>
          Number(
            p.deaths || 0
          )
      )
    );

  const observations = [];

  // ----------------------------------------------------------
  // VISIÓN
  // ----------------------------------------------------------

  if (
    player.visionScore <
    averageVision * 0.70
  ) {

    observations.push({
      type: "negative",
      icon: "◉",
      title: "MALA VISIÓN",
      description:
        `Su puntuación de visión fue ${Number(
          player.visionScore || 0
        ).toFixed(0)}, considerablemente por debajo del promedio de ${averageVision.toFixed(
          0
        )} de su equipo.`
    });

  } else if (
    player.visionScore >
    averageVision * 1.30
  ) {

    observations.push({
      type: "positive",
      icon: "◉",
      title: "CONTROL DE VISIÓN",
      description:
        `Su puntuación de visión fue ${Number(
          player.visionScore || 0
        ).toFixed(0)}, muy por encima del promedio del equipo (${averageVision.toFixed(
          0
        )}).`
    });
  }

  // ----------------------------------------------------------
  // PARTICIPACIÓN EN ASESINATOS
  // ----------------------------------------------------------

  if (
    playerKP <
    averageKP * 0.65
  ) {

    observations.push({
      type: "negative",
      icon: "⚔",
      title: "JUGADOR PASIVO",
      description:
        `Participó en aproximadamente ${playerKP.toFixed(
          0
        )}% de los asesinatos de su equipo, por debajo del promedio de ${averageKP.toFixed(
          0
        )}%.`
    });

  } else if (
    playerKP >
    averageKP * 1.25
  ) {

    observations.push({
      type: "positive",
      icon: "⚔",
      title: "ALTO IMPACTO",
      description:
        `Participó en aproximadamente ${playerKP.toFixed(
          0
        )}% de los asesinatos de su equipo, superando claramente el promedio.`
    });
  }

  // ----------------------------------------------------------
  // DAÑO
  // ----------------------------------------------------------

  if (
    player.damage <
    averageDamage * 0.65
  ) {

    observations.push({
      type: "negative",
      icon: "✦",
      title: "BAJO DAÑO",
      description:
        `Infligió ${formatNumber(
          player.damage
        )} de daño a campeones, bastante menos que el promedio de ${formatNumber(
          averageDamage
        )}.`
    });

  } else if (
    player.damage >
    averageDamage * 1.30
  ) {

    observations.push({
      type: "positive",
      icon: "✦",
      title: "ALTO DAÑO",
      description:
        `Infligió ${formatNumber(
          player.damage
        )} de daño a campeones, superando ampliamente el promedio de su equipo.`
    });
  }

  // ----------------------------------------------------------
  // MUERTES
  // ----------------------------------------------------------

  if (
    player.deaths >= 5 &&
    player.deaths >
      averageDeaths * 1.35
  ) {

    observations.push({
      type: "negative",
      icon: "☠",
      title: "MUY EXPUESTO",
      description:
        `Terminó con ${player.deaths} muertes, una cifra considerablemente superior al promedio de ${averageDeaths.toFixed(
          1
        )}.`
    });
  }

  // ----------------------------------------------------------
  // KDA
  // ----------------------------------------------------------

  const kda =
    player.deaths === 0
      ? player.kills +
        player.assists
      : (
          (
            player.kills +
            player.assists
          ) /
          player.deaths
        );

  if (
    kda >= 4
  ) {

    observations.push({
      type: "positive",
      icon: "★",
      title: "EXCELENTE KDA",
      description:
        `Terminó con un KDA de ${kda.toFixed(
          2
        )}, reflejando una participación muy eficiente en combate.`
    });
  }

  // ----------------------------------------------------------
  // ESLABÓN MÁS DÉBIL
  // ----------------------------------------------------------

  if (
    observations.length === 0
  ) {

    const contribution =
      calculateContribution(
        player,
        team
      );

    const contributions =
      team.map(
        p =>
          calculateContribution(
            p,
            team
          )
      );

    const minContribution =
      Math.min(
        ...contributions
      );

    if (
      contribution ===
      minContribution
    ) {

      observations.push({
        type: "neutral",
        icon: "◆",
        title: "ESLABÓN MÁS DÉBIL",
        description:
          "Su rendimiento global fue el más bajo de su equipo al comparar participación, daño, supervivencia y visión."
      });

    }

  }

  // Limitar para no convertir la tarjeta en una tesis doctoral.

  return observations.slice(
    0,
    3
  );
}

function calculateContribution(
  player,
  team
) {

  const maxDamage =
    Math.max(
      ...team.map(
        p =>
          Number(
            p.damage || 0
          )
      ),
      1
    );

  const maxVision =
    Math.max(
      ...team.map(
        p =>
          Number(
            p.visionScore || 0
          )
      ),
      1
    );

  const teamKills =
    team.reduce(
      (sum, p) =>
        sum +
        Number(
          p.kills || 0
        ),
      0
    ) || 1;

  const kp =
    (
      (
        Number(player.kills || 0) +
        Number(player.assists || 0)
      ) /
      teamKills
    );

  const damage =
    Number(
      player.damage || 0
    ) /
    maxDamage;

  const vision =
    Number(
      player.visionScore || 0
    ) /
    maxVision;

  const deaths =
    Math.max(
      0,
      1 -
      Number(
        player.deaths || 0
      ) / 10
    );

  return (
    kp * 0.40 +
    damage * 0.30 +
    vision * 0.15 +
    deaths * 0.15
  );
}

function average(values) {

  if (!values.length)
    return 0;

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}

// ============================================================
// NAVEGACIÓN PRINCIPAL
// ============================================================

function setMainView(view) {

  const leaderboard =
    document.getElementById("clasificacion");

  const standings =
    document.querySelector(".standings-card");

  const summary =
    document.querySelector(".summary-grid");

  const legal =
    document.querySelector(".legal-card");

  const profile =
    document.getElementById("playerProfile");

  const details =
    document.getElementById("matchDetails");

  const prizes =
    document.getElementById("premios");

  const winner =
    document.getElementById("ganador");


  const isPrizes =
    view === "premios";

  const isLeaderboard =
    view === "clasificacion";

  const isWinner =
    view === "ganador";


  /* ----------------------------------------------------------
     OCULTAR OTRAS SECCIONES
     ---------------------------------------------------------- */

  if (profile)
    profile.hidden = true;

  if (details)
    details.hidden = true;


  if (leaderboard)
    leaderboard.style.display =
      isLeaderboard ? "" : "none";

  if (standings)
    standings.style.display =
      isLeaderboard ? "" : "none";

  if (summary)
    summary.style.display =
      isLeaderboard ? "" : "none";

  if (legal)
    legal.style.display =
      isLeaderboard ? "" : "none";

  if (prizes)
    prizes.hidden =
      !isPrizes;

  if (winner)
    winner.hidden =
      !isWinner;


  /* ----------------------------------------------------------
     PESTAÑA GANADOR
     ---------------------------------------------------------- */

  if (isWinner && winner) {

    /* Reiniciar animación */

    winner.classList.remove(
      "winner-enter"
    );

    /*
     * requestAnimationFrame permite que el navegador
     * registre el cambio antes de volver a añadir
     * la clase.
     */

    requestAnimationFrame(() => {

      requestAnimationFrame(() => {

        winner.classList.add(
          "winner-enter"
        );

      });

    });


    /* --------------------------------------------------------
       REPRODUCIR MÚSICA
       -------------------------------------------------------- */

    const winnerMusic =
      document.getElementById(
        "winnerMusic"
      );

    if (winnerMusic) {

      winnerMusic.currentTime = 0;

      winnerMusic
        .play()
        .catch(error => {

          console.warn(
            "[WINNER MUSIC]",
            "El navegador bloqueó la reproducción:",
            error
          );

        });

    }

  }


  /* ----------------------------------------------------------
     DETENER MÚSICA AL SALIR
     ---------------------------------------------------------- */

  else {

    const winnerMusic =
      document.getElementById(
        "winnerMusic"
      );

    if (winnerMusic) {

      winnerMusic.pause();

      winnerMusic.currentTime = 0;

    }

  }


  /* ----------------------------------------------------------
     NAVEGACIÓN ACTIVA
     ---------------------------------------------------------- */

  document
    .querySelectorAll(
      ".main-nav a[data-nav]"
    )
    .forEach(link => {

      link.classList.toggle(
        "active",
        link.dataset.nav === view
      );

    });

}

function setupMainNavigation() {
  document
    .querySelectorAll(".main-nav a[data-nav]")
    .forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        const view = link.dataset.nav;
        setMainView(view);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
}

// ============================================================
// BOTONES ATRÁS
// ============================================================

document
  .getElementById(
    "backToLeaderboard"
  )
  ?.addEventListener(
    "click",
    () => {

      setMainView("clasificacion");

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  );

document
  .getElementById(
    "backToProfile"
  )
  ?.addEventListener(
    "click",
    () => {

      document.getElementById(
        "matchDetails"
      ).hidden = true;

      document.getElementById(
        "playerProfile"
      ).hidden = false;

      document.getElementById(
        "playerProfile"
      ).scrollIntoView({
        behavior: "smooth"
      });
    }
  );

// ============================================================
// REFRESH
// ============================================================

async function refreshLeaderboard() {

  const button =
    document.getElementById(
      "refreshBtn"
    );

  if (button) {
    button.classList.add(
      "spinning"
    );
  }

  try {

    const data =
      await loadLeaderboard();

    renderLeaderboard(
      data
    );

    const lastUpdate =
      document.getElementById(
        "lastUpdate"
      );

    if (lastUpdate) {

      lastUpdate.textContent =
        formatTime(
          data.updatedAt
        );

    }

  } catch (error) {

    console.error(
      error
    );

  } finally {

    if (button) {
      button.classList.remove(
        "spinning"
      );
    }
  }
}

document
  .getElementById(
    "refreshBtn"
  )
  ?.addEventListener(
    "click",
    refreshLeaderboard
  );

// ============================================================
// TEMPORIZADORES
// ============================================================

function updateCountdownElement(element) {
  if (!element) return;

  const target = new Date(TOURNAMENT_TARGET).getTime();
  const difference = Math.max(0, target - Date.now());

  const days = Math.floor(difference / 86400000);
  const hours = Math.floor(difference / 3600000) % 24;
  const minutes = Math.floor(difference / 60000) % 60;
  const seconds = Math.floor(difference / 1000) % 60;

  element.textContent =
    `${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (difference <= 0) {
    element.textContent = "00:00:00:00";
  }
}

function startChallengeTimer() {
  const countdown = document.getElementById("countdown");
  const prizeCountdown = document.getElementById("prizeCountdown");

  const update = () => {
    updateCountdownElement(countdown);
    updateCountdownElement(prizeCountdown);
  };

  update();
  setInterval(update, 1000);
}

// ============================================================
// INICIO
// ============================================================

async function init() {

  setupMainNavigation();
  setMainView("clasificacion");
  startChallengeTimer();

  await refreshLeaderboard();
}

init();