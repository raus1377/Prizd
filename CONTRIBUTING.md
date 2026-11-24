# Contributing to Prizd

Everyone with a GitHub account can contribute. No Prizd account or collaborator access is needed.

## Suggest an opportunity

Open a [submission issue](https://github.com/raus7n/Prizd/issues/new?template=submit-opportunity.yml). Include the official source, organizer, deadline, eligibility, location and funding. Only hackathons, research opportunities (including research internships) and case competitions are published. Do not include private information.

## Submit a pull request

1. [Fork the repository](https://github.com/raus7n/Prizd/fork) and create a branch.
2. Copy `templates/opportunity.json` into `data/opportunities/` with a unique slug. Use `Hackathon`, `Research`, `Research internship` or `Case competition` as appropriate. Add the organizer to `data/organizers.json` if missing. For corrections, edit the existing record. For website improvements, edit `src/` or `scripts/`, not generated `dist/` files.
3. Run `npm run check`, `npm test` and `npm run build` locally.
4. Open a pull request against `main`, describing the change and linking official sources for listings.

Maintainers review submissions before merging. Public contribution does not grant direct write access to main or automatic publication.
