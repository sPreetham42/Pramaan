# Security Policy

PRAMAAN is a Smart India Hackathon prototype — there are no production
deployments — but we still handle security issues seriously and privately.

## Reporting a vulnerability

**Do NOT report security issues publicly** — no public GitHub Issues, no
Pull Requests, no discussion posts. Report privately so the problem can be
fixed before it is disclosed.

How to report:

- If the repository owner has enabled **private vulnerability reporting**
  (GitHub: repository Settings → Code security and analysis → Private
  vulnerability reporting), use the **Report a vulnerability** button on
  the repository's Security page.
- Otherwise, contact the repository owner (team lead) directly through the
  team's private channel and say it is a security issue.

What to include in a report:

- A short description of the issue and its impact
- Steps to reproduce, or a minimal proof of concept
- The affected component / endpoint / file
- A suggested fix, if you have one

What NOT to include:

- Real credentials or secrets. Redact anything sensitive — never paste live
  API keys, passwords, or personal data into a report.

## Secrets and the codebase

- **Never commit** `.env` files, API keys, credentials, database dumps, or
  private data. `.gitignore` covers the common patterns, but always check
  `git status` before committing.
- `.env.example` contains development-only placeholders — never replace
  them with real credentials.
- If a secret is committed by accident, tell the repository owner
  immediately. Revoke/rotate the secret — deleting the file is not enough,
  because it remains in Git history.

## Scope

This policy applies to the PRAMAAN repository and its team spaces. For the
contribution workflow, see [`CONTRIBUTING.md`](CONTRIBUTING.md); for
project context, see [`CONTEXT.md`](CONTEXT.md).