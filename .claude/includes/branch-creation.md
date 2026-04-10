Create the feature branch from a clean, up-to-date `main`.

```bash
git switch main
git pull origin main
git switch -c <branch_name>
```

Where `<branch_name>` follows the format: `NT-<short_id>/<task_slug>/feature`
Example: `NT-195de922/add-product-search/feature`

**If the branch already exists:**

- Check if it's from a previous attempt on the same task
- Ask the user whether to reuse it (`git switch <branch_name>`) or pick a new name
- Do NOT delete the existing branch without confirmation

**If `git pull` fails** (e.g., diverged history), stop and tell the user to resolve the issue manually.
