name: Update Player Stats

on:
  schedule:
    - cron: '30 */6 * * *'  # 30 min after the centre job, so the two never hit the API together
  workflow_dispatch:

# Queue instead of collide (same pattern as update-data.yml)
concurrency:
  group: update-player-stats
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  update-player-stats:
    runs-on: ubuntu-latest
    # 100 min: the fetch script's MAX_RUNTIME_MS cap is 80 min (enough for all
    # ~136 players at the observed ~14s/call pace), and it checkpoints every 5
    # players so a kill can't lose the cycle. ~20 min headroom here for the
    # final write + git commit/push. Public repo -> Actions minutes are free.
    timeout-minutes: 100

    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          persist-credentials: true
          fetch-depth: 0   # full history: required so the rebase below can work

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '22'

      - name: Run player stats fetch script
        run: node scripts/fetch-player-stats.mjs
        env:
          NODE_OPTIONS: '--max-old-space-size=4096'

      - name: Check data was updated
        run: |
          echo "Checking if player stats file was modified..."
          if [ -f data/player-stats-history.json ]; then
            echo "History file exists, cycle: $(grep -o '"cycle": *[0-9]*' data/player-stats-history.json | head -1)"
          else
            echo "ERROR: data/player-stats-history.json not found!"
            exit 1
          fi

      - name: Configure git
        run: |
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          git config --global user.name "github-actions[bot]"

      - name: Commit and push
        run: |
          git add data/player-stats-history.json
          git diff --staged --quiet && echo "No changes to commit" || {
            git commit -m "Update player stats history - $(date '+%Y-%m-%d %H:%M UTC')"
            git pull --rebase origin main
            git push
          } 
