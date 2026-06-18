import { Editor, type EditorTheme, type TUI } from "@earendil-works/pi-tui";

/**
 * Editor subclass that triggers inline slash-command autocomplete as soon as
 * the user types "/" at a token boundary, mimicking the built-in "@" trigger.
 *
 * Pi's core editor ignores "/" as a custom triggerCharacters value and only
 * auto-opens the slash menu at the start of the message. We leave that path
 * untouched and force-trigger the menu for inline "/" occurrences.
 */
export class InlineSlashEditor extends Editor {
	constructor(tui: TUI, theme: EditorTheme, _keybindings?: unknown) {
		super(tui, theme);
	}

	override handleInput(data: string): void {
		super.handleInput(data);

		if (data !== "/") return;

		const cursor = this.getCursor();
		if (cursor.line !== 0) return;

		const currentLine = this.getLines()[cursor.line] ?? "";
		const beforeCursor = currentLine.slice(0, cursor.col);

		// Core already handles "/" at the start of the message.
		if (this.isAtStartOfMessage(beforeCursor)) return;

		// Only trigger at a token boundary, matching "@" behavior.
		if (!/(?:^|[ \t])\/$/.test(beforeCursor)) return;

		(this as unknown as { tryTriggerAutocomplete: () => void }).tryTriggerAutocomplete();
	}

	private isAtStartOfMessage(beforeCursor: string): boolean {
		const trimmed = beforeCursor.trim();
		return trimmed === "" || trimmed === "/";
	}
}
