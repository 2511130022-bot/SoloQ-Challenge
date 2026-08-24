# LoL Tournament — Live Riot API

Página de clasificación con estilo esports/neón. La interfaz consulta un backend Node/Express que mantiene la Riot API Key en el servidor.

## Participantes configurados

- Bryanpro#007 (LAS / plataforma `la2`)
- SenChristianuwu#LAS (LAS / plataforma `la2`)

Para agregar más participantes, edita `TOURNAMENT_PLAYERS` en `server.js`.

## Qué obtiene la aplicación

- Riot ID (Game Name + Tag Line)
- icono de perfil del invocador (`profileIconId`)
- rango de Solo/Duo
- LP
- victorias y derrotas de Solo/Duo
- winrate calculado
- campeón más usado en las últimas partidas de Solo/Duo analizadas por Match-V5
- partidas y winrate de ese campeón
- flecha de tendencia comparando la posición actual contra el último snapshot guardado

## Requisitos

- Node.js 18+ (se recomienda una versión LTS reciente)
- una API Key de Riot Developer Portal

## Instalación

1. Abre una terminal en esta carpeta.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env`.
4. En `.env`, reemplaza `RGAPI-PEGA_AQUI_TU_API_KEY` por tu clave real.
5. Ejecuta `npm start`.
6. Abre `http://localhost:3000`.

## Importante

No pongas la Riot API Key en `app.js`, HTML, CSS o cualquier archivo que vaya al navegador.

La página usa la plataforma `la2` para LAS y el routing regional `americas` para Account-V1 y Match-V5.

## Tendencia

La flecha no inventa un dato de Riot: se calcula comparando la posición de cada participante con el último snapshot que la aplicación guardó en `data/leaderboard-snapshot.json`.

En la primera consulta de un jugador la tendencia aparece neutral (`—`). Después de una actualización, `▲` significa que subió posiciones y `▼` que bajó.

## Campeón más usado

Se consultan partidas recientes de Solo/Duo y se cuenta cuántas veces aparece cada campeón. En caso de empate, se prioriza el campeón con más victorias.

## Nota legal

La aplicación debe mostrar el aviso de no afiliación exigido por las políticas de Riot. Revisa las políticas vigentes del Developer Portal antes de publicar el producto.
