# AppSec Untangled Resources

This repo is a Claude Code marketplace (`appsec-untangled`) with one plugin
(`appsec-skills`). The plugin holds all skills and the wiki. The wiki is also
built into a GitHub Pages site with Zensical.

## Layout

- `.claude-plugin/marketplace.json`: marketplace manifest
- `plugins/appsec-skills/.claude-plugin/plugin.json`: plugin manifest
- `plugins/appsec-skills/skills/<skill-name>/SKILL.md`: one folder per skill
- `plugins/appsec-skills/wiki/docs/`: wiki pages (site source and skill reference).
  `threats/` is what the skill reads; `methodology.md` and `using-the-skill.md`
  are for readers of the site and are never loaded by a skill.
  `example-report.html` is copied from the report template at build time and is
  gitignored — edit the template, not the copy.
- `plugins/appsec-skills/wiki/examples/`: per-stack examples, included into pages
- `zensical.toml`, `.github/workflows/wiki-site.yml`: website build

## Rules

- Keep the wiki inside the plugin folder. A plugin cannot read files outside
  its own directory.
- In skills, reference wiki pages as `${CLAUDE_PLUGIN_ROOT}/wiki/docs/...` and
  examples as `${CLAUDE_PLUGIN_ROOT}/wiki/examples/...`.
- Keep example files out of `wiki/docs/`, or they become pages on the site.
- See `CONTRIBUTING.md` for the threat page format and stack file names.
- A skill's `name` in its front matter must match its folder name.
- Write the wiki in plain markdown, with no front matter. The only site syntax
  allowed is tabs (`=== "Django"`) wrapping snippet includes (`--8<--`); a skill
  reading the raw page uses those include paths to find the stack examples.

## Checks

```
claude plugin validate --strict .
claude plugin validate --strict plugins/appsec-skills
zensical build --clean
```

Try the plugin locally with `claude --plugin-dir plugins/appsec-skills`.
