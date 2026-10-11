# squad-kit workspace

This folder is managed by [squad-kit](https://github.com/AzmSquad/squad-kit).

- **Project:** khidma
- **Language:** javascript
- **Tracker:** none

## Workflow

1. **Intake** — `squad new-story <feature-slug>` scaffolds `stories/<feature>/<id>/intake.md`. Paste the tracker title, description, and acceptance criteria.
2. **Plan** — Run `/squad-plan <intake-path>` in your agent (or `squad new-plan <intake-path>` to get the composed prompt on stdout).
3. **Implement** — Open a new, scoped agent session and attach **only** the generated `NN-story-*.md` file. Let a cheap model execute it.

Plan meta-prompts (`generate-plan.md`, `story-skeleton.md`) ship inside the squad-kit package — they are not copied here. Upgrade squad-kit to update them.
