import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["/"],
			
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const currentLine = lines[cursorLine] ?? "";
				const textBeforeCursor = currentLine.slice(0, cursorCol);
				
				const match = textBeforeCursor.match(/(?:^|[ \t])\/([^\s/]*)$/);
				const builtin = await current.getSuggestions(lines, cursorLine, cursorCol, options);
				
				if (!match) {
					return builtin;
				}

				const token = match[1] || "";
				const commands = pi.getCommands();
				
				const commandItems = commands.map((cmd) => ({
					value: `/${cmd.name}`,
					label: `/${cmd.name}`,
					description: cmd.description,
				}));

				let filteredCommands = commandItems;
				if (token.trim()) {
					filteredCommands = fuzzyFilter(commandItems, token, (item) => item.label);
				}

				if (filteredCommands.length === 0) {
					return builtin;
				}

				const builtinItems = builtin?.items ?? [];
				const builtinValues = new Set(builtinItems.map(i => i.value));
				
				const newItems = filteredCommands.filter(i => !builtinValues.has(i.value));
				
				if (newItems.length === 0) {
					return builtin;
				}

				return {
					items: [...builtinItems, ...newItems],
					prefix: builtin?.prefix ?? `/${token}`,
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});
}
