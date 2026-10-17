# inline-slash-autocomplete

Expand Pi skills and prompt templates inside a draft—mid-sentence or at the
start of a later line.

## Usage

Type `/` at a word boundary, then search by skill or template name. Use the
arrow keys to select a result and **Tab** to insert its content without sending
the message. If suggestions are closed, Tab opens them (or expands a single
match). For example:

```text
Please inspect these changes.
/rev<Tab>
```

A matching `/review` template is replaced by its Markdown body, preserving the
surrounding draft. `/skill:pdf-tools` inserts the skill instructions in a
`<skill>` block with the source location and relative-reference directory.
Frontmatter is removed in both cases.

- Bare skill names and explicit `skill:` prefixes are searchable.
- Inline template selection uses **no arguments**: defaults are applied and
  missing argument placeholders are cleared. Existing text after the cursor is
  preserved, not consumed as template arguments. Use native first-line template
  invocation for argument substitution, e.g. `/review concurrency`.
- Slash commands at the beginning of the **first line** remain entirely native,
  including their argument completion and submit-time expansion.
- Inline results include **only skills and prompt templates**. Built-ins such as
  `/new` and `/model`, and commands registered by extensions, are not expanded.
- Expansion happens when accepting a suggestion, not by scanning submitted text
  for slash tokens. A manually entered inline token must be completed to expand.
- Enter keeps Pi's native completion behavior: accepting a slash suggestion can
  submit the message. Use Tab to expand and continue editing.

## Loading

For development, load this directory's entry point explicitly:

```sh
pi --extension ./index.ts
```

Use the existing toolkit installation workflow for persistent installation.
This extension does not modify Pi's installed files.

## Compatibility

Verified against `@earendil-works/pi-coding-agent` 1.3.0. Pi reserves `/` rather
than honoring it as a provider trigger on later lines. A small `CustomEditor`
adapter invokes the host's private autocomplete trigger; that bridge is checked
at construction and covered by real-editor regression tests. Retest after Pi
upgrades.

An already configured custom editor is never replaced. In that case, a warning
explains that automatic opening is unavailable; Tab still works through the
provider if that editor supports Pi's standard completion contract.

## Verification

With Pi installed locally or globally and its Node runtime available:

```sh
npm test
npm run test:tui  # macOS/Linux; also requires Python 3
```

No dependency installation, model requests, or external services are needed.
See [TESTING.md](TESTING.md) for coverage and limits.

## License

MIT © AJ Anderson
