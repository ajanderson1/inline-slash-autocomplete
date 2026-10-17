# Testing

## Command

`npm test` runs standalone Node assertions using the locally installed Pi package,
or the global package reported by `npm root -g`. No test framework or additional
dependencies are installed. Use Pi's supported Node version (22.19 or newer).

## R1: in-process host integration

The suite loads this extension with Pi's own `jiti`, wires its provider into the
real `CustomEditor` and `CombinedAutocompleteProvider`, and drives terminal input
through `handleInput`. Skill/template Markdown fixtures live in an owned temporary
directory removed in `finally`. The terminal renderer is a no-op; no model, network,
audio, credentials, global settings, or user installation is used.

Coverage includes later-line automatic opening and Tab expansion, inline and
indented contexts, multiline replacement/cursor preservation, skills' reference
locations, template defaults, exclusions, native first-line behavior, Escape/app
shortcuts, file completion, missing resources, custom-editor preservation, and
non-TUI modes.

`INLINE_SLASH_ENTRY=/absolute/path/to/index.ts npm test` runs the same assertions
against another revision. Against the pre-fix entry point, the first regression
fails because typing `/` on line 2 never opens suggestions.

## Isolated TUI smoke (macOS/Linux)

`npm run test:tui` requires Python 3 and the installed `pi` executable. It creates
a throwaway agent directory, skill, template, and diagnostic shortcut, then drives
Pi in a pseudoterminal. It types a multiline draft, selects each resource with
Tab, captures the actual editor content, and exits through native `/quit`.
Startup is offline, telemetry is disabled, extension discovery/context loading is
disabled, and no draft is submitted to a model. Owned child processes and temporary
files are cleaned up even on failure. No persistent installation is changed.

## Limits

R2/container and remote/full-stack rungs are not applicable. These are behavioral,
not visual snapshot, checks. The adapter uses a checked private editor method
because Pi has no public inline slash-trigger API. A passing result covers the
installed Pi version only; rerun after upgrades. Native first-line skill/template
execution belongs to Pi.
