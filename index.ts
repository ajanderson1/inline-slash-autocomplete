import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { stripFrontmatter, type ExtensionAPI, type SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, type AutocompleteItem } from "@earendil-works/pi-tui";
import { InlineSlashEditor } from "./editor.js";
import { getInlineSlashToken } from "./inline-token.js";

function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function expand(command: SlashCommandInfo): string {
	const path = command.sourceInfo.path;
	const body = stripFrontmatter(readFileSync(path, "utf8")).trim();
	if (command.source === "skill") {
		const name = command.name.replace(/^skill:/, "");
		return `<skill name="${escapeAttribute(name)}" location="${escapeAttribute(path)}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`;
	}
	// Selecting a template has no arguments: use defaults and clear unfilled placeholders in one pass.
	return body.replace(
		/\$\{(?:\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:\d+(?::\d+)?\}|\$(?:ARGUMENTS|@|\d+)/g,
		(_match, fallback: string | undefined) => fallback ?? "",
	).trimEnd();
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		if (ctx.ui.getEditorComponent()) {
			ctx.ui.notify("Inline slash expansion: keeping your custom editor; use Tab to open inline suggestions.", "warning");
		} else {
			ctx.ui.setEditorComponent((tui, theme, keybindings) => new InlineSlashEditor(tui, theme, keybindings));
		}

		ctx.ui.addAutocompleteProvider((current) => {
			const itemCommands = new WeakMap<AutocompleteItem, SlashCommandInfo>();
			return {
				async getSuggestions(lines, cursorLine, cursorCol, options) {
					const token = getInlineSlashToken(lines, cursorLine, cursorCol);
					if (token === undefined) {
						return current.getSuggestions(lines, cursorLine, cursorCol, options);
					}
					if (options.signal.aborted) return null;

					const commands = pi.getCommands().filter(command => command.source === "skill" || command.source === "prompt");
					const matches = fuzzyFilter(commands, token, command => command.name.replace(/^skill:/, ""));
					const matched = new Set(matches);
					// Match both spellings, ranking bare skill names before skill:-prefix-only matches like Pi does.
					const qualifiedMatches = fuzzyFilter(
						commands.filter(command => command.source === "skill" && !matched.has(command)),
						token,
						command => command.name,
					);
					const filtered = [...matches, ...qualifiedMatches];
					if (filtered.length === 0) {
						return options.force ? current.getSuggestions(lines, cursorLine, cursorCol, options) : null;
					}

					const items = filtered.map(command => {
						const item: AutocompleteItem = {
							value: `/${command.name}`,
							label: `/${command.name}`,
							...(command.description ? { description: command.description } : {}),
						};
						itemCommands.set(item, command);
						return item;
					});
					return { items, prefix: `/${token}` };
				},

				applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
					const command = itemCommands.get(item);
					if (!command) {
						return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
					}
					let content: string;
					try {
						content = expand(command);
					} catch (error) {
						ctx.ui.notify(`Cannot expand /${command.name}: ${error instanceof Error ? error.message : String(error)}`, "error");
						return { lines, cursorLine, cursorCol };
					}

					const line = lines[cursorLine] ?? "";
					const beforePrefix = line.slice(0, cursorCol - prefix.length);
					const afterCursor = line.slice(cursorCol);
					const suffix = /^[ \t]/.test(afterCursor) ? "" : " ";
					const inserted = `${beforePrefix}${content}${suffix}`.split("\n");
					const lastLine = inserted.length - 1;
					const newCursorCol = inserted[lastLine]!.length;
					inserted[lastLine] += afterCursor;
					return {
						lines: [...lines.slice(0, cursorLine), ...inserted, ...lines.slice(cursorLine + 1)],
						cursorLine: cursorLine + lastLine,
						cursorCol: newCursorCol,
					};
				},

				shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
					if (getInlineSlashToken(lines, cursorLine, cursorCol) !== undefined) return true;
					return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
				},
			};
		});
	});
}
