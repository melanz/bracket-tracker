# March Madness 2026 Bracket Tracker

Static site (HTML/CSS/JavaScript) that loads bracket data from CSV files, compares each player’s picks to a **master** bracket, and shows scores plus max possible scores. Includes an **admin** page to update `master.csv` as games finish.

## Run locally

Browsers block `fetch()` to local files from `file://`. Serve the project folder:

```bash
cd brackets2026
./serve.sh
# same as: python3 -m http.server 8080
```

**Do not** double-click `index.html` — browsers block loading `data/*.csv` from `file://`, so the leaderboard will stay empty until you use HTTP.

Open:

- **Leaderboard & brackets:** [http://localhost:8080/index.html](http://localhost:8080/index.html)
- **Add player (interactive bracket):** [http://localhost:8080/add-player.html](http://localhost:8080/add-player.html)
- **Master editor:** [http://localhost:8080/admin.html](http://localhost:8080/admin.html)

## Data files

| File | Purpose |
|------|---------|
| `data/teams.csv` | One team name per line. **Line index (0-based) = team ID.** |
| `data/bracket.csv` | `position,team_id` for **seeds** only: positions **64–127** (64 teams after First Four). |
| `data/first_four.csv` | `team1_id,team2_id,winner_id,bracket_position` for each play-in game. |
| `data/master.csv` | `position,team_id` for **completed** games: internal nodes **1–63** only. |
| `data/players/index.csv` | One filename per line (e.g. `jane.csv`). |
| `data/players/<name>.csv` | Header `position,team_id`. Rows **1–63** = main bracket picks; rows **`ff0`**–**`ff3`** = First Four winner picks (same order as `first_four.csv`). **+1** per correct First Four game. |

### Binary tree layout

- Index **1** = national champion game.
- **2–3** = Final Four semifinals; **4–7** = regional finals; …; **32–63** = Round of 64.
- **64–127** = first-round matchups (seeds).

Child links: left `2p`, right `2p+1`, parent `⌊p/2⌋`.

## Scoring

- **+1** per game where the player’s pick matches `master.csv` once that game is decided (main bracket, positions 1–63).
- **+1** per **First Four** game where the player’s pick (`ff0`–`ff3` in their CSV) matches the `winner_id` in `first_four.csv` (same row order: game 0 = first row, …).
- **Score** = main-bracket points + First Four points.
- **Max possible** = main-bracket max possible (see below) **+** First Four points already earned (First Four results are fixed once play-ins are done).
- **Main bracket max possible** = current main score + pending games where the picked team is **not** eliminated yet.

Eliminated teams are derived from the master bracket (losers of decided games).

## UI behavior

- **Green/yellow styling:** correct picks (`pick-correct`).
- **Red / strikethrough:** wrong pick vs master (`pick-wrong`), or pick still “alive” in the bracket but the team is already eliminated (`pick-impossible`, `team-out`).

## Admin page (`admin.html`)

1. Click a **team name** in a playable game to set the winner (both sides must be known).
2. **Clear** removes that result and any later result that depended on it (via the chain toward the championship).
3. **Save master.csv** uses the File System Access API in Chrome/Edge if available (pick `data/master.csv` once; later saves reuse the handle). Otherwise the file is **downloaded** — replace `data/master.csv` manually.

First Four pairings are **not** edited in the admin UI; change `first_four.csv` and `bracket.csv` if you need a different field.

## Add a player (`add-player.html`)

1. Enter a display name and file **slug** (letters, numbers, hyphens — used as `data/players/<slug>.csv`).
2. Pick all four **First Four** winners, then click through the **main bracket** until the champion is set (63 games).
3. **Save player CSV** — in Chrome/Edge you can pick the **project root folder** (the folder that contains `data/`); the app writes `data/players/<slug>.csv` and appends `<slug>.csv` to `data/players/index.csv`. Otherwise use **Download only** and copy the file in manually, plus add the filename to `index.csv`.
4. Reload the leaderboard.

## Updating the tournament

1. As games finish, add or update rows in `data/master.csv`, **or** use `admin.html` and save.
2. Reload `index.html` to refresh scores and highlighting.
