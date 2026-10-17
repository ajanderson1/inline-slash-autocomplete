import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { parseKey, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { getInlineSlashToken } from "./inline-token.js";

type AutocompleteBridge = { tryTriggerAutocomplete: () => void };

export class InlineSlashEditor extends CustomEditor {
	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
		super(tui, theme, keybindings);
		if (typeof (this as unknown as AutocompleteBridge).tryTriggerAutocomplete !== "function") {
			throw new Error("Inline slash expansion is incompatible with this Pi editor: no autocomplete trigger.");
		}
	}

	override handleInput(data: string): void {
		const previousText = this.getText();
		super.handleInput(data);
		const key = parseKey(data) ?? data;
		if (this.getText() === previousText || this.isShowingAutocomplete() || [...key].length !== 1 || /[\s\p{C}]/u.test(key)) {
			return;
		}
		const cursor = this.getCursor();
		if (getInlineSlashToken(this.getLines(), cursor.line, cursor.col) === undefined) {
			return;
		}
		// Pi reserves '/' and exposes no public trigger; keep this version-sensitive bridge isolated.
		(this as unknown as AutocompleteBridge).tryTriggerAutocomplete();
	}
}
