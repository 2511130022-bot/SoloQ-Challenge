const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const ACCOUNTS_FILE = path.join(
    __dirname,
    "data",
    "accounts.json"
);

const PARTICIPANTS = [
    {
        id: "bryanpro",
        gameName: "Bryanpro",
        tagLine: "007"
    },
    {
        id: "batman-bugha",
        gameName: "Batman Bugha",
        tagLine: "JCRG"
    }
];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto
        .scryptSync(password, salt, 64)
        .toString("hex");

    return {
        salt,
        hash
    };
}

function ask(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer.trim());
        });
    });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {

    await fs.mkdir(
        path.dirname(ACCOUNTS_FILE),
        {
            recursive: true
        }
    );

    let data;

    try {
        data = JSON.parse(
            await fs.readFile(
                ACCOUNTS_FILE,
                "utf8"
            )
        );
    } catch {
        data = {
            accounts: []
        };
    }

    console.log("");
    console.log("=================================");
    console.log("      CREAR CUENTA TORNEO");
    console.log("=================================");
    console.log("");

    console.log("Participantes disponibles:");

    PARTICIPANTS.forEach((p, index) => {
        console.log(
            `${index + 1}. ${p.gameName}#${p.tagLine}`
        );
    });

    console.log("");

    const participantNumber =
        Number(
            await ask("Participante: ")
        );

    const participant =
        PARTICIPANTS[participantNumber - 1];

    if (!participant) {
        console.log("Participante inválido.");
        rl.close();
        return;
    }

    const username =
        await ask("Nombre de usuario: ");

    const password =
        await ask("Contraseña: ");

    if (!username || !password) {
        console.log(
            "Usuario y contraseña son obligatorios."
        );

        rl.close();
        return;
    }

    const existing =
        data.accounts.find(
            account =>
                account.username.toLowerCase() ===
                username.toLowerCase()
        );

    if (existing) {
        console.log(
            "Ese nombre de usuario ya existe."
        );

        rl.close();
        return;
    }

    const passwordData =
        hashPassword(password);

    const account = {
        id:
            crypto.randomUUID(),

        username,

        passwordHash:
            passwordData.hash,

        passwordSalt:
            passwordData.salt,

        participantId:
            participant.id,

        gameName:
            participant.gameName,

        tagLine:
            participant.tagLine,

        blueShellLastSentAt:
            null,

        createdAt:
            new Date().toISOString()
    };

    data.accounts.push(account);

    await fs.writeFile(
        ACCOUNTS_FILE,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log("Cuenta creada correctamente.");
    console.log(
        `Usuario: ${username}`
    );
    console.log(
        `Participante: ${participant.gameName}#${participant.tagLine}`
    );
    console.log("");

    rl.close();
}

main();