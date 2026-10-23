# PRIZD — update only ONE folder

After a **one-time installation**, do not replace the repository and do not hand-edit `dist/`.

## Routine maintenance (GitHub website)

1. Open your existing repository, then open **`updates/inbox/`**.
2. Choose **Add file → Upload files** and upload an input file. Supported formats:
   - **`.json`**: one listing, an array of listings, or `{ "upsert": [...], "remove": [...] }`.
   - **`.jsonl`**: one JSON listing per line.
   - **`.txt`**: structured `Field: value` entries, optionally separated by a line containing `---`.
   - **`.remove`** or **`remove.txt`**: one listing **ID** per line to remove (e.g. `my-old-hackathon-2026`).
3. Commit directly to `main`.
4. Under **Actions**, check **Sync data and publish opportunity board**. On success, the public website is rebuilt, and processed files disappear from `updates/inbox/` (the automation commits their removal).

There is nothing else you need to upload for routine updates. If your domain is still served by **Netlify** instead of GitHub Pages, configure that Netlify site to build with `npm run build` and publish `dist/`, or to publish the committed `dist/` directory; GitHub Pages settings alone do not change Netlify hosting. For local use, run `npm run sync && npm run build`; on GitHub the workflow does both automatically.

## What the automation does

- Adds opportunities and updates records **by ID**, preserving their original `addedAt` for edited records.
- Resolves an existing organizer, or creates a new organizer in `data/organizers.json` from details supplied **in the same inbox file**.
- Validates URLs, required fields, category names, deadline formats and organizer relationships before writing anything.
- Moves manually removed or expired opportunities into `data/archive/` and excludes them from the live site. Unknown dates stay in the catalog; the workflow does not guess a deadline.
- Compiles `dist/opportunities.json` and `dist/data.js`, commits updated compiled files along with data changes, runs automated checks, and deploys GitHub Pages in the **same workflow run**. A static host connected to GitHub may also redeploy on that generated commit.
- Also checks for expired entries on a **daily schedule** around 07:17 IST. GitHub-hosted jobs may run later.

**This does not search the internet for new opportunities.** New or corrected records must still be supplied in `updates/inbox/`; converting arbitrary pasted research prose into complete JSON requires human review or an external AI/data extraction step. There is no built-in paid API.

## Easy text file format

Copy `updates/examples/new-event.template.txt`, replace its values, then upload it to `updates/inbox/`. Multiple entries may be separated by a line of `---`.

The text parser supports `Title`, `ID` (optional: generated from title), `Category`, `Organizer`, `Organizer Kind`, `Organizer Website`, `Organizer Prestige` (optional: default 40), `Summary`, `Deadline`, `Deadline Date`, `Deadline Timezone`, `Location`, `Format`, `Eligibility`, `Team Min`, `Team Max`, `Prize Amount`, `Prize Currency`, `Prize Kind`, `Prize Description`, `Tags`, `URL`, `Entry Status` and other fields described in the original README. For an already-listed event, an `ID` plus the fields you wish to change is enough.

For new opportunities, provide **Category** (from `data/settings.json`), **Title**, **Organizer** (or known `Organizer ID`), and **URL**. If you leave important fields unknown, the system marks the record for checking; it never invents prizes or deadlines. Set **Organizer Kind** to `Company`, `College`, `Organization` or `Community`. Prestige is a curator-set value from 0 to 100, not a verified global ranking.

`Deadline` must be a time with a timezone, e.g. `2026-11-15T19:00:00+05:30`, or you may use `Deadline Date: 2026-11-15` when the exact cutoff time is unknown. If the organizer is new and no organizer website is supplied, the event URL is used as a provisional link; supply the real organizer site when possible.

## JSON bulk example

```json
{
  "upsert": [
    {
      "id": "example-event-2026",
      "title": "Example Event 2026",
      "category": "Hackathon",
      "organizer": {
        "name": "Example Organizer",
        "kind": "Organization",
        "website": "https://example.org",
        "prestige": 40
      },
      "summary": "Replace with verified event details.",
      "deadline": null,
      "location": "Worldwide",
      "format": "Online",
      "eligibility": "Confirm eligibility on the official event website.",
      "team": null,
      "prize": {
        "amount": null,
        "currency": "USD",
        "kind": "undisclosed",
        "description": "Not confirmed"
      },
      "tags": [],
      "url": "https://example.org",
      "entryStatus": "check"
    },
    { "id": "qhack-2026", "summary": "Example of updating an existing listing by ID" }
  ],
  "remove": ["my-old-hackathon-2026"]
}
```

This is a **template**, not real current event data. Do not upload unchanged template placeholders into the live catalog.

## How the daily expiry rule works

- A full `deadline` timestamp closes at its exact instant.
- A calendar-only `deadlineDate` closes after that date in `deadlineTimezone` (default `Asia/Kolkata`).
- Listings explicitly marked `entryStatus: "closed"` are archived.
- A listing with no known deadline is retained, not removed on a guess.
- Archived records are stored under `data/archive/` in case you need to inspect them later. Re-upload a corrected record to reactivate it; make sure it has a future deadline and non-closed status.

## One-time installation into an EXISTING repo

You **do not** need to delete or recreate your GitHub repository. Copy the files from `open-call-one-folder-patch.zip` over the same relative paths (using `git clone`/GitHub Desktop/VS Code), then commit and push once. The patch supplies `.github/workflows/pages.yml`, `scripts/sync.mjs`, `package.json`, `README.md`, `UPDATES_GUIDE.md`, and the `updates/` + `data/archive/` placeholders. It keeps your existing frontend, CSS, JSON listings and repository history intact.

If repository settings prohibit Action-generated commits, allow **read and write** workflow permissions under **Settings → Actions → General → Workflow permissions**, subject to any organization policy. Configure **Settings → Pages → Source: GitHub Actions**. Use **Actions → Sync data and publish opportunity board → Run workflow** to test.

For help identifying a failed run, open its **Process inbox and archive expired entries** or **Check and test** step. A validation error blocks the new deployment and leaves the last successful website live. You can correct the same inbox file and commit the fix.

## Security

No API keys are required. Do not paste personal information, access tokens or private invitations into a public repository. Review eligibility and deadlines from official pages before publishing. The workflow may need Actions to be enabled by your repository owner; GitHub schedules are best-effort rather than exact-time guarantees.
