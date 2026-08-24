let authToken =
    localStorage.getItem(
        "tournamentAuthToken"
    );

async function login(
    username,
    password
) {

    const response =
        await fetch(
            "/api/auth/login",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        username,
                        password
                    })
            }
        );

    const data =
        await response.json();

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Error iniciando sesión."
        );
    }

    authToken =
        data.token;

    localStorage.setItem(
        "tournamentAuthToken",
        authToken
    );

    return data;
}
async function checkAuthentication() {

    if (!authToken) {

        showLogin();

        return null;
    }

    const response =
        await fetch(
            "/api/auth/me",
            {
                headers: {
                    Authorization:
                        `Bearer ${authToken}`
                }
            }
        );

    if (!response.ok) {

        localStorage.removeItem(
            "tournamentAuthToken"
        );

        authToken = null;

        showLogin();

        return null;
    }

    const data =
        await response.json();

    hideLogin();

    return data.user;
}
function showLogin() {

    document
        .getElementById(
            "loginScreen"
        )
        .classList.remove(
            "hidden"
        );

}

function hideLogin() {

    document
        .getElementById(
            "loginScreen"
        )
        .classList.add(
            "hidden"
        );

}
document
    .getElementById("loginForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const username =
                document
                    .getElementById(
                        "loginUsername"
                    )
                    .value;

            const password =
                document
                    .getElementById(
                        "loginPassword"
                    )
                    .value;

            const errorElement =
                document
                    .getElementById(
                        "loginError"
                    );

            errorElement.textContent =
                "";

            try {

                await login(
                username,
                password
                );

                await initializeBlueShells();

            } catch (error) {

                errorElement.textContent =
                error.message;

        }

        }
    );async function loadTargets() {

    const response =
        await fetch(
            "/api/leaderboard"
        );

    const data =
        await response.json();

    const container =
        document.getElementById(
            "targetPlayers"
        );

    container.innerHTML = "";

    const me =
        await checkAuthentication();

    data.players
        .filter(
            player =>
                player.gameName !==
                me.gameName
        )
        .forEach(
            player => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "target-button";

                button.textContent =
                    `${player.gameName}#${player.tagLine}`;

                button.dataset.target =
                    player.gameName ===
                    "Bryanpro"
                        ? "bryanpro"
                        : "batman-bugha";

                button.addEventListener(
                    "click",
                    () => {

                        selectedTarget =
                            button.dataset.target;

                        document
                            .getElementById(
                                "blueShellArena"
                            )
                            .classList.remove(
                                "hidden"
                            );

                    }
                );

                container.appendChild(
                    button
                );

            }
        );
}
let selectedTarget = null;
async function chooseBlueShell(
    color
) {

    if (!selectedTarget) {

        alert(
            "Primero selecciona un objetivo."
        );

        return;
    }

    const cards =
        document.querySelectorAll(
            ".shell-card"
        );

    cards.forEach(
        card => {
            card.disabled = true;
        }
    );

    try {

        const response =
            await fetch(
                "/api/blue-shell/send",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${authToken}`
                    },

                    body:
                        JSON.stringify({

                            targetParticipantId:
                                selectedTarget,

                            selectedColor:
                                color

                        })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "No se pudo enviar la Blue Shell."
            );

        }

        showBlueShellResult(
            data.shell
        );

        updateCooldown();

    } catch (error) {

        alert(
            error.message
        );

        cards.forEach(
            card => {
                card.disabled = false;
            }
        );

    }

}
document
    .querySelectorAll(
        ".shell-card"
    )
    .forEach(
        card => {

            card.addEventListener(
                "click",
                () => {

                    chooseBlueShell(
                        card.dataset.color
                    );

                }
            );

        }
    );
    function showBlueShellResult(
    shell
) {

    const modal =
        document.getElementById(
            "blueShellResult"
        );

    const target =
        document.getElementById(
            "shellTarget"
        );

    const difficulty =
        document.getElementById(
            "shellDifficulty"
        );

    const title =
        document.getElementById(
            "shellChallengeTitle"
        );

    const description =
        document.getElementById(
            "shellChallengeDescription"
        );

    target.textContent =
        `Objetivo: ${shell.targetName}`;

    difficulty.textContent =
        `DIFICULTAD: ${shell.difficulty.toUpperCase()}`;

    title.textContent =
        shell.challenge.title;

    description.textContent =
        shell.challenge.description;

    modal.classList.remove(
        "hidden"
    );

}
document
    .getElementById(
        "closeShellResult"
    )
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "blueShellResult"
                )
                .classList.add(
                    "hidden"
                );

            document
                .getElementById(
                    "blueShellArena"
                )
                .classList.add(
                    "hidden"
                );

        }
    );
    async function updateCooldown() {

    const response =
        await fetch(
            "/api/blue-shell/status",
            {
                headers: {
                    Authorization:
                        `Bearer ${authToken}`
                }
            }
        );

    if (!response.ok) {
        return;
    }

    const data =
        await response.json();

    const element =
        document.getElementById(
            "blueShellCooldown"
        );

    if (data.available) {

        element.textContent =
            "🔵 DISPONIBLE";

        return;
    }

    startCooldownTimer(
        data.remainingMs
    );
}
function startCooldownTimer(
    milliseconds
) {

    const element =
        document.getElementById(
            "blueShellCooldown"
        );

    let remaining =
        milliseconds;

    const update = () => {

        if (remaining <= 0) {

            element.textContent =
                "🔵 DISPONIBLE";

            return;
        }

        const hours =
            Math.floor(
                remaining /
                3600000
            );

        const minutes =
            Math.floor(
                (
                    remaining %
                    3600000
                ) /
                60000
            );

        const seconds =
            Math.floor(
                (
                    remaining %
                    60000
                ) /
                1000
            );

        element.textContent =
            `⏳ ${String(hours).padStart(2,"0")}:` +
            `${String(minutes).padStart(2,"0")}:` +
            `${String(seconds).padStart(2,"0")}`;

        remaining -= 1000;

        setTimeout(
            update,
            1000
        );
    };

    update();
}
async function initializeBlueShells() {

    const user =
        await checkAuthentication();

    if (!user) {
        return;
    }

    await loadTargets();

    await updateCooldown();
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        initializeBlueShells();
    }
);