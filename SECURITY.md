# Prizd security

Report vulnerabilities privately through GitHub private vulnerability reporting if enabled. Do not post credentials, personal data or exploitable details in public issues.

## Public versus private
Source code and security policies may be public. Security does not depend on hiding code. Keep service-role keys, OAuth secrets, signing keys, database passwords, backups, incident records and user data in the provider's private secret store or restricted storage. Never include secrets in a browser bundle, public PR, Git history or workflow logs. Rotate any exposed secret immediately. `private/`, `secrets/` and local environment files are ignored by Git, not encrypted or backed up by Git.

## Before enabling accounts
- Apply both SQL files and test anonymous access and cross-account read/write denials.
- Restrict OAuth redirect URLs to the actual HTTPS site; require administrator MFA and least-privilege roles.
- Use Supabase Auth rate limits and bot protection where appropriate; review logs for anomalous signup spikes.
- Keep aggregate metrics private. Do not collect device fingerprints, precise location or unnecessary contact information.
- Enable GitHub branch protection, private vulnerability reporting, dependency alerts and secret scanning where available. Review public PRs before merging; never expose production secrets to fork PRs.
- Review the privacy notice and deletion behavior before opening registration; obtain any age-related consent required by applicable law.
- Configure host-level security headers (CSP, HSTS, frame restrictions, referrer policy) on a host that supports them; GitHub Pages cannot set arbitrary response headers. Test OAuth and assets before enforcing CSP.
- Review dependency versions and update safely; monitor and rotate credentials; use private encrypted backups with restricted access and retention.

Email endpoints remain disabled in the website until explicitly configured. Do not enable them before server-side abuse prevention and email consent checks are reviewed.

The SQL and documentation are preparation, not a certification or verification of the deployed service.
