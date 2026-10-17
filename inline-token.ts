export function getInlineSlashToken(lines: string[], cursorLine: number, cursorCol: number): string | undefined {
	const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
	if (cursorLine === 0 && beforeCursor.trimStart().startsWith("/")) {
		return undefined;
	}
	return beforeCursor.match(/(?:^|[ \t])\/([^\s/]*)$/)?.[1];
}
