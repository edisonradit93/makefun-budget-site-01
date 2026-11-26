# HEARTHLEDGER — Household Budget & Cashflow Studio

[![make.fun · best-household-budget-site-20261126-1457](https://make.fun/badge/best-household-budget-site-20261126-1457.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)
[![rank](https://make.fun/badge/best-household-budget-site-20261126-1457/edisonradit93/makefun-budget-site-01/rank.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)
[![reward](https://make.fun/badge/best-household-budget-site-20261126-1457/edisonradit93/makefun-budget-site-01/reward.svg)](https://make.fun/bounty/best-household-budget-site-20261126-1457?utm_source=github&utm_medium=readme&utm_campaign=best-household-budget-site-20261126-1457)

A self-contained, zero-dependency editorial personal finance and household budgeting web application built with vanilla HTML, CSS, and ES modules.

## Key Capabilities
- **Household Scenario Presets**: Instant switching between *Young Family*, *Solo Renter*, and *Debt Paydown Sprint*, persisted locally in `localStorage` with one-click reset.
- **50 / 30 / 20 Allocation & Envelopes**: Live tracking of Needs, Wants, and Savings/Debt targets alongside interactive category limit sliders.
- **Interactive SVG Analytics**: Custom Category Allocation Donut, 6-Month Cashflow & Net Savings Trend Chart, and Goal / Debt Payoff Trackers with interactive monthly contribution forecasting.
- **Full Ledger CRUD**: Add, edit, delete, search, filter, and sort transactions and budget categories with immediate recalculation.
- **Offline Export**: Zero-network CSV transaction ledger and JSON budget snapshot exports.

## Running the Submission Builder
```bash
node main.ts
```
Copies `app/` and `screenshots/` into `MAKEFUN_OUTPUT_DIR` (default `/output`) and generates `dossier.json` via `./vendor/makefun-frontend.ts`.
