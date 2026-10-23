# PRIZD — Hackathons, case competitions and paid internships

A GitHub-ready opportunity board for hackathons, case competitions, product, finance, consulting, marketing, economics and related fields. The frontend uses giant black typography, a pale grey canvas, floating glass forms, pink reflections and scroll-driven chapter transitions.

The board contains the supplied competition listings. Card titles, featured picks and **Visit event** links open the event’s official page directly. **Details** shows the deadline, eligibility, reward breakdown and notes.

**New one-folder maintenance:** after the one-time upgrade, upload JSON, JSONL or structured text only into `updates/inbox/`. GitHub Actions imports changes, synchronizes organizer records, archives expired competitions, rebuilds the site and publishes it automatically. Read **[UPDATES_GUIDE.md](UPDATES_GUIDE.md)**. No database, API key or npm package installation is required.

## Accounts and email alerts

Optional sign-in with Google, a synced shortlist, an email digest and deadline reminders. See [SETUP_ACCOUNTS.md](SETUP_ACCOUNTS.md). Off until you add a Supabase project.

## Publish on GitHub Pages

1. Create a repository named `prizd` (or any name), with the default branch named **main**.
2. Extract this ZIP. Upload the contents of the `prizd` folder into your repository root. Include **`.github`**, which contains the publishing workflow. `package.json`, `src/`, `data/`, `scripts/`, `tests/` and `.github/` must be at the repository root.
3. Open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Sync data and publish Prizd → Run workflow**. Choose `main` and run it.
5. When the workflow finishes, the deployment job and **Settings → Pages** show your website link.

Every subsequent commit to `main` rebuilds and publishes the board automatically. Relative assets support repository subpaths and custom domains.

Official setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Search visibility (SEO)

A single JavaScript page is almost invisible to Google, so the build also writes plain HTML that search engines can read:

- **One page per listing** at `/<category>/<listing-id>/` (for example `/hackathons/nebius-nvidia-ai-2026/`) with the prize, deadline, eligibility and official link, plus links to related listings. Listings with no official link yet show "Official link coming soon".
- **One page per category** (`/hackathons/`, `/case-competitions/`, `/research-internships/` and so on) and an **India page** (`/india/`) for everything in the India region. Titles and intro copy are editable in `data/settings.json` under `categoryPages` and `regionPages`. Pages with fewer than three listings are marked `noindex` until they grow.
- **Archived listings keep their page.** When the daily sync moves an expired listing to `data/archive/`, its URL stays online marked "Closed", so search engines do not hit a 404 and past editions keep ranking.
- **`sitemap.xml`, `robots.txt`, `404.html`**, canonical tags, Open Graph / Twitter cards and structured data (WebSite, WebPage, CollectionPage, breadcrumbs).
- A **“Browse by type”** section on the home page so crawlers reach every page from the front door.
- The existing **daily sync** keeps open/closed status and the sitemap current without a commit.

### Set your address (important)

Canonical tags and the sitemap need the site's public address. The GitHub workflow supplies it automatically (your custom domain once you add one under **Settings → Pages → Custom domain**). For other hosts, set `"siteUrl": "https://your-domain"` in `data/settings.json` or run `SITE_URL=https://your-domain npm run build`. Without it the build prints a warning and skips canonical tags, structured data and the sitemap.

`robots.txt` only takes effect at the root of a domain, so use a custom domain (a `.in` or `.com`) rather than `username.github.io/repo`. After deploying, add the site to Google Search Console and submit `https://your-domain/sitemap.xml`.

### Writing listings that rank

Each listing page is built from its JSON file, so the data is the content. Specific titles ("Meta Global AI Developer Hackathon 2026"), a clear `summary`, honest `eligibility` (say whether Indian students can enter) and a filled-in `prize.description` give each page something unique to rank for. Outbound links are cleaned of `utm_*` tracking parameters automatically.

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

- Margin-style design: serif display type, ink/apricot/cream/lime/lavender palette, split hero with a top-picks panel.
- Separate title and featured-link areas to prevent text overlap while scrolling.
- Direct official links, search, category/organizer/format/team/status filters and grid/list layouts.
- Saved shortlists in the visitor’s browser and shareable opportunity-detail links.
- Mobile layouts, keyboard focus, accessible dialogs and reduced-motion support.

Shortlists are specific to the browser/device. You upload verified incoming listings to `updates/inbox/`; the site does not discover new opportunities automatically.

Install Node.js 22 or newer, then run:

```sh
npm run build
npm start
```

Open `http://localhost:3000`. Stop with Ctrl+C. No `npm install` is required. The included `dist/index.html` also opens directly, but category and listing pages need `npm start` (folder links do not resolve from `file://`); sharing and storage follow your browser’s file-mode policies.

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
| `src/` | Frontend and filters |
| `scripts/build.mjs` | Validation, file discovery and build |
| `scripts/seo.mjs` | Listing pages, category and India pages, sitemap, robots, meta tags and structured data |
| `src/pages.css`, `src/page.js` | Styles and status refresh for the generated pages |
| `src/og-image.png` | 1200×630 share image used in link previews |
| `.github/workflows/pages.yml` | Automatic GitHub Pages publication |
| `tests/` | Ranking, freshness, status, validation and Git-date checks |
| `dist/` | Ready-to-view build, regenerated by the workflow |

Syntax, build and behavior checks are included (`npm run check`, `npm test`).
