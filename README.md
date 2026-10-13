# OPEN CALL — The Opportunity Index

A GitHub-ready opportunity board for hackathons, case competitions, product, finance, consulting, marketing, economics and related fields. The frontend uses giant black typography, a pale grey canvas, floating glass forms, pink reflections and scroll-driven chapter transitions.

The board contains the supplied competition listings. Card titles, featured picks and **Visit event** links open the event’s official page directly. **Details** shows the deadline, eligibility, reward breakdown and notes.

**New one-folder maintenance:** after the one-time upgrade, upload JSON, JSONL or structured text only into `updates/inbox/`. GitHub Actions imports changes, synchronizes organizer records, archives expired competitions, rebuilds the site and publishes it automatically. Read **[UPDATES_GUIDE.md](UPDATES_GUIDE.md)**. No database, API key or npm package installation is required.

## Publish on GitHub Pages

1. Create a repository named `open-call` (or any name), with the default branch named **main**.
2. Extract this ZIP. Upload the contents of the `open-call` folder into your repository root. Include **`.github`**, which contains the publishing workflow. `package.json`, `src/`, `data/`, `scripts/`, `tests/` and `.github/` must be at the repository root.
3. Open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Build and publish opportunity board → Run workflow**. Choose `main` and run it.
5. When the workflow finishes, the deployment job and **Settings → Pages** show your website link.

Every subsequent commit to `main` rebuilds and publishes the board automatically. Relative assets support repository subpaths and custom domains.

Official setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Add or update opportunities

**Preferred method: use `updates/inbox/` only.** See [UPDATES_GUIDE.md](UPDATES_GUIDE.md) for bulk upload, structured TXT and automatic expiry. The legacy manual process below still works for individual edits, but is no longer required.


1. Copy `templates/opportunity.json`.
2. In GitHub, open `data/opportunities/` → **Add file → Create new file**.
3. Use a unique filename such as `climate-challenge-2026.json`.
4. Replace the title, organizer, URL, deadline, eligibility and reward details with your listing’s information. Use the exact event or application link you want visitors to open.
5. Commit to `main` and wait for the publishing workflow.

To edit an entry, open its JSON file, click the pencil, change the values and commit. To remove it, delete its file and commit. Editing preserves its original addition date.

Add organizers in `data/organizers.json`; use their IDs in each listing. Add categories in `data/settings.json` before using them. The site name is also in settings; the footer wordmark is in `src/index.html`.

## Opportunity fields

| Field | What to enter |
| --- | --- |
| `id` | Unique lowercase slug |
| `title` | Event name |
| `category` | A label from `data/settings.json` |
| `categories` | Optional additional configured categories for filters |
| `organizerId` | An ID from `data/organizers.json` |
| `summary` | A short description of the challenge and deliverable |
| `deadline` | ISO timestamp with timezone, such as `2026-11-02T18:00:00+05:30`; use `null` when the exact cutoff is unknown |
| `deadlineDate` | Optional `YYYY-MM-DD` when only the calendar date is known; keep `deadline` as `null` |
| `deadlineTimezone` | Optional timezone for a calendar deadline; defaults to `Asia/Kolkata` |
| `deadlineLabel` | Optional label such as `Registration deadline` |
| `entryStatus` | `open`, `upcoming`, `check` or `closed` |
| `opensOn` | Optional opening date in `YYYY-MM-DD`; an upcoming listing becomes open on this date |
| `location` | City, country or `Worldwide` |
| `format` | `Online`, `In person`, `Hybrid` or `To confirm` |
| `eligibility` | Age, student, country and other requirements |
| `team` | `{ "min": 1, "max": 4 }`; use `null` if unknown, or `max: null` if only the minimum is known |
| `teamText` | Optional descriptive team rules |
| `prize.amount` | Numeric amount; `null` if unknown |
| `prize.currency` | Three-letter currency code such as `USD`, `INR` or `GBP` |
| `prize.kind` | `pool`, `first`, `none` or `undisclosed` |
| `prize.description` | Reward details; distinguish cash, credits, grants and non-cash awards |
| `tags` | Searchable strings |
| `url` | Direct event/application URL using `https://` or `http://` |
| `sourceUrl` | Optional separate rules/source link |
| `notes` | Optional array of relevant details or unresolved conditions |
| `addedAt` | Optional timezone-aware timestamp for imports/builds without Git |
| `prize.usdEquivalent` | Optional USD comparison estimate overriding the configured conversion rate |

The workflow identifies invalid files and fields. The last successful website stays online until the data is fixed.

## New and status filters

**New** uses the first Git commit that added each file, following renames. Files added within the last seven days appear in New. Editing a deadline or prize does not reset this date. The workflow uses `fetch-depth: 0` to retain history. Without Git, the build falls back to `addedAt`, then the build time.

The browser compares addition dates and deadlines with the current time. The scheduled GitHub Action additionally archives expired catalog entries every day. Exact timestamps close at their specified instant. Calendar-only deadlines close after the stated date in the configured timezone, without displaying a made-up cutoff time.

The default collection shows open entries. **Filters → Status** also offers upcoming entries, entries whose terms need checking, past/closed entries and all statuses. The automated daily sync archives expired listings; saved links to archived items will no longer appear in the active board. Uncertain eligibility is preserved in the listing’s notes.

## Ranking

The homepage and default results sort by:

1. Organizer `prestige`, descending, with companies and colleges on the same scale.
2. Estimated USD prize value, descending.
3. Soonest known deadline, then title.

Organizer priorities are editable curator choices. Choose **Highest prizes**, **Closing soon** or **Newest added** to change the order. Prize pools and first prizes have separate labels. Currency comparison rates in settings are estimates; update them or specify `prize.usdEquivalent`.

## Features and local use

- Four pinned scroll chapters with rotating WebGL glass objects and a CSS fallback.
- Separate title and featured-link areas to prevent text overlap while scrolling.
- Direct official links, search, category/organizer/format/team/status filters and grid/list layouts.
- Saved shortlists in the visitor’s browser and shareable opportunity-detail links.
- Mobile layouts, keyboard focus, accessible dialogs and reduced-motion support.

The glass forms are built in code. Shortlists are specific to the browser/device. You upload verified incoming listings to `updates/inbox/`; the site does not discover new opportunities automatically.

Install Node.js 22 or newer, then run:

```sh
npm run build
npm start
```

Open `http://localhost:3000`. Stop with Ctrl+C. No `npm install` is required. The included `dist/index.html` also opens directly; sharing and storage follow your browser’s file-mode policies.

To check changes:

```sh
npm run check
npm test
```

## Project map

| Path | Purpose |
| --- | --- |
| `updates/inbox/` | **Only folder you edit routinely**: add/update/remove inputs |
| `scripts/sync.mjs` | Inbox import, organizer sync, validation and expiry archive |
| `data/archive/` | Previously active, expired or manually removed listings |
| `data/opportunities/*.json` | Generated/synchronized active opportunity files |
| `data/organizers.json` | Organizer names, types and ranking priorities |
| `data/settings.json` | Categories, New window and prize comparison rates |
| `templates/opportunity.json` | Copyable listing template |
| `src/` | Frontend, filters and scroll/glass animation |
| `scripts/build.mjs` | Validation, file discovery and build |
| `.github/workflows/pages.yml` | Automatic GitHub Pages publication |
| `tests/` | Ranking, freshness, status, validation and Git-date checks |
| `dist/` | Ready-to-view build, regenerated by the workflow |

Syntax, build and behavior checks are included. Browser-based visual verification was unavailable for this update.
