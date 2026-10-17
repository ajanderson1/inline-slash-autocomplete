import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

let agentEntry;
try {
	agentEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
} catch {
	const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 5000 }).trim();
	agentEntry = join(globalRoot, "@earendil-works/pi-coding-agent/dist/index.js");
}
const hostRequire = createRequire(agentEntry);
const tuiEntry = hostRequire.resolve("@earendil-works/pi-tui");
const { createJiti } = await import(pathToFileURL(hostRequire.resolve("jiti")).href);
const { CustomEditor } = await import(pathToFileURL(agentEntry).href);
const { CombinedAutocompleteProvider } = await import(pathToFileURL(tuiEntry).href);
const { KeybindingsManager } = await import(pathToFileURL(join(dirname(agentEntry), "core/keybindings.js")).href);
const { substituteArgs } = await import(pathToFileURL(join(dirname(agentEntry), "core/prompt-templates.js")).href);
const jiti = createJiti(import.meta.url, {
	alias: { "@earendil-works/pi-coding-agent": agentEntry, "@earendil-works/pi-tui": tuiEntry },
});
const entry = process.env.INLINE_SLASH_ENTRY ?? fileURLToPath(new URL("../index.ts", import.meta.url));
const { default: extension } = await jiti.import(resolve(entry));
const fixtureDir = mkdtempSync(join(tmpdir(), "inline-slash-"));
const skillPath = join(fixtureDir, "SKILL.md");
const promptPath = join(fixtureDir, "review.md");
writeFileSync(skillPath, "---\nname: pdf-tools\ndescription: Read PDFs.\n---\nRead the PDF.\nCheck references/format.md.\n");
writeFileSync(promptPath, "---\ndescription: Review changes.\n---\nReview changes.\nReport ${1:-correctness}. $@\n");
const sourceInfo = path => ({ path, source: "local", scope: "user", origin: "top-level" });
const commands = [
	{ name: "skill:pdf-tools", source: "skill", description: "Read PDFs.", sourceInfo: sourceInfo(skillPath) },
	{ name: "review", source: "prompt", description: "Review changes.", sourceInfo: sourceInfo(promptPath) },
	{ name: "speak", source: "extension", description: "Speak.", sourceInfo: sourceInfo("unused.ts") },
];
const identity = value => value;
const theme = {
	borderColor: identity,
	selectList: { selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity },
};
const bindings = new KeybindingsManager();
let passed = 0;

function setup({ existingEditor, mode = "tui", commandList = commands } = {}) {
	const events = new Map();
	const notifications = [];
	const builtin = new CombinedAutocompleteProvider([
		{ name: "new" }, { name: "model" }, ...commandList.map(command => ({ name: command.name })),
	], fixtureDir);
	let provider = builtin;
	let factory;
	extension({ on: (name, handler) => events.set(name, handler), getCommands: () => commandList });
	events.get("session_start")({}, {
		mode, hasUI: mode === "tui",
		ui: {
			addAutocompleteProvider: decorate => { provider = decorate(provider); },
			getEditorComponent: () => existingEditor,
			setEditorComponent: value => { factory = value; },
			notify: (message, level) => notifications.push({ message, level }),
		},
	});
	const tui = { requestRender() {} };
	const editor = factory ? factory(tui, theme, bindings) : new CustomEditor(tui, theme, bindings);
	editor.setAutocompleteProvider(provider);
	return { editor, provider, notifications, factory, events };
}

async function settle() {
	await delay(5);
}

async function type(editor, text) {
	for (const character of text) {
		editor.handleInput(character);
		await settle();
	}
}

async function check(name, run) {
	await run();
	passed++;
	console.log(`PASS ${name}`);
}

try {
	await check("typing slash at the start of line 2 opens completion", async () => {
		const { editor } = setup();
		editor.setText("Please inspect this.\n");
		await type(editor, "/");
		assert.equal(editor.isShowingAutocomplete(), true);
	});

	await check("line-2 skill selection expands its body and preserves location", async () => {
		const { editor } = setup();
		editor.setText("Please inspect this.\n");
		await type(editor, "/skill:pdf");
		editor.handleInput("\t");
		await settle();
		assert.match(editor.getText(), /^Please inspect this\.\n<skill name="pdf-tools" location="/);
		assert.ok(editor.getText().includes(`References are relative to ${fixtureDir}.`));
		assert.ok(editor.getText().includes("Read the PDF.\nCheck references/format.md."));
		assert.ok(editor.getText().endsWith("</skill> "));
		assert.equal(editor.getText().includes("description:"), false);
		assert.deepEqual(editor.getCursor(), { line: 6, col: 9 });
	});

	await check("Tab directly expands a prompt at the start of a new line", async () => {
		const { editor } = setup();
		editor.setText("Context\n/rev");
		editor.handleInput("\t");
		await settle();
		assert.equal(editor.getText(), "Context\nReview changes.\nReport correctness. ");
		assert.deepEqual(editor.getCursor(), { line: 2, col: 20 });
	});

	await check("mid-sentence completion still opens and expands", async () => {
		const { editor } = setup();
		editor.setText("Please ");
		await type(editor, "/rev");
		assert.equal(editor.isShowingAutocomplete(), true);
		editor.handleInput("\t");
		await settle();
		assert.equal(editor.getText(), "Please Review changes.\nReport correctness. ");
	});

	await check("indented later-line tokens expand without a doubled slash", async () => {
		const { editor } = setup();
		editor.setText("Context\n  /rev");
		editor.handleInput("\t");
		await settle();
		assert.equal(editor.getText(), "Context\n  Review changes.\nReport correctness. ");
	});

	await check("expansion preserves text after the cursor and following lines", async () => {
		const { provider } = setup();
		const lines = ["Context", "/rev trailing", "Next line"];
		const suggestions = await provider.getSuggestions(lines, 1, 4, { signal: new AbortController().signal });
		const result = provider.applyCompletion(lines, 1, 4, suggestions.items[0], suggestions.prefix);
		assert.deepEqual(result.lines, ["Context", "Review changes.", "Report correctness. trailing", "Next line"]);
		assert.deepEqual(lines, ["Context", "/rev trailing", "Next line"]);
	});

	await check("inline suggestions exclude built-ins and extension commands", async () => {
		const { provider } = setup();
		const suggestions = await provider.getSuggestions(["Context", "/"], 1, 1, { signal: new AbortController().signal });
		assert.deepEqual(new Set(suggestions.items.map(item => item.value)), new Set(["/skill:pdf-tools", "/review"]));
		for (const token of ["/new", "/model", "/speak"]) {
			assert.equal(await provider.getSuggestions(["Context", token], 1, token.length, { signal: new AbortController().signal }), null);
		}
	});

	await check("first-line native skill, prompt, extension and built-in completion stays native", async () => {
		const { provider } = setup();
		for (const [prefix, expected] of [["/rev", "review"], ["/skill:pdf", "skill:pdf-tools"], ["/mod", "model"], ["/spe", "speak"]]) {
			const result = await provider.getSuggestions([prefix], 0, prefix.length, { signal: new AbortController().signal });
			const item = result.items.find(item => item.value === expected);
			assert.ok(item);
			assert.equal(provider.applyCompletion([prefix], 0, prefix.length, item, result.prefix).lines[0], `/${expected} `);
		}
	});

	await check("Escape cancels without reopening; app shortcuts still work", async () => {
		const { editor } = setup();
		editor.setText("Context\n");
		await type(editor, "/rev");
		editor.handleInput("\x1b");
		await settle();
		assert.equal(editor.isShowingAutocomplete(), false);
		let escaped = false;
		editor.onEscape = () => { escaped = true; };
		editor.handleInput("\x1b");
		assert.equal(escaped, true);
	});

	await check("paths and embedded slashes delegate to native completion", async () => {
		const { provider } = setup();
		const suggestions = await provider.getSuggestions(["Context", `${fixtureDir}/SK`], 1, `${fixtureDir}/SK`.length, { signal: new AbortController().signal, force: true });
		assert.ok(suggestions.items.some(item => item.value.endsWith("SKILL.md")));
		assert.equal(await provider.getSuggestions(["x/rev"], 0, 5, { signal: new AbortController().signal }), null);
	});

	await check("unreadable resources report an error without changing the draft", async () => {
		const missing = { ...commands[1], sourceInfo: sourceInfo(join(fixtureDir, "missing.md")) };
		const { provider, notifications } = setup({ commandList: [missing] });
		const lines = ["Context", "/rev"];
		const suggestions = await provider.getSuggestions(lines, 1, 4, { signal: new AbortController().signal });
		assert.deepEqual(provider.applyCompletion(lines, 1, 4, suggestions.items[0], suggestions.prefix), { lines, cursorLine: 1, cursorCol: 4 });
		assert.equal(notifications[0].level, "error");
	});

	await check("existing custom editors are preserved with a visible warning", async () => {
		const { factory, notifications } = setup({ existingEditor: () => {} });
		assert.equal(factory, undefined);
		assert.ok(notifications.some(notification => notification.level === "warning"));
	});

	await check("non-TUI modes do not install an editor", async () => {
		assert.equal(setup({ mode: "rpc" }).factory, undefined);
	});

	await check("line 3 and bare skill names work", async () => {
		const { editor } = setup();
		editor.setText("Context\nMore context\n");
		await type(editor, "/pdf");
		assert.equal(editor.isShowingAutocomplete(), true);
		editor.handleInput("\t");
		await settle();
		assert.ok(editor.getText().startsWith("Context\nMore context\n<skill"));
	});

	await check("multiline expansion can be undone atomically", async () => {
		const { editor } = setup();
		editor.setText("Context\n");
		await type(editor, "/rev");
		editor.handleInput("\t");
		await settle();
		editor.handleInput("\x1b[45;5u");
		assert.equal(editor.getText(), "Context\n/rev");
	});

	await check("template selection matches Pi's empty-argument substitution", async () => {
		const path = join(fixtureDir, "arguments.md");
		const bodies = [
			"Defaults: ${1:-correctness} ${@:-all} ${ARGUMENTS:-fallback}",
			"Missing: $1 $2 $@ $ARGUMENTS ${@:1} ${@:2:3}",
			"Single pass: ${1:-$2} ${@:-$ARGUMENTS}",
			"Literal shell: $PATH ${HOME} $$ end",
		];
		for (const body of bodies) {
			writeFileSync(path, `---\ndescription: Arguments.\n---\n${body}\n`);
			const { provider } = setup({ commandList: [{ ...commands[1], sourceInfo: sourceInfo(path) }] });
			const result = await provider.getSuggestions(["Context", "/rev"], 1, 4, { signal: new AbortController().signal });
			assert.equal(provider.applyCompletion(["Context", "/rev"], 1, 4, result.items[0], result.prefix).lines.slice(1).join("\n"), `${substituteArgs(body, []).trimEnd()} `);
		}
	});

	await check("partial skill: prefixes remain discoverable without duplicates", async () => {
		const { provider } = setup();
		for (const token of ["/ski", "/pdf", "/skill:pdf"]) {
			const result = await provider.getSuggestions(["Context", token], 1, token.length, { signal: new AbortController().signal });
			assert.deepEqual(result.items.map(item => item.value), ["/skill:pdf-tools"]);
		}
	});

	await check("forced unmatched absolute paths still use file completion", async () => {
		if (process.platform === "win32") return;
		const { provider } = setup();
		const result = await provider.getSuggestions(["Context", "/tm"], 1, 3, { signal: new AbortController().signal, force: true });
		assert.ok(result.items.some(item => item.value === "/tmp/"));
	});

	await check("cancelled provider requests have no results", async () => {
		const { provider } = setup();
		const controller = new AbortController();
		controller.abort();
		assert.equal(await provider.getSuggestions(["Context", "/"], 1, 1, { signal: controller.signal }), null);
	});

	await check("native first-line command arguments keep their provider", async () => {
		const { editor, provider } = setup();
		const result = await provider.getSuggestions(["/model /rev"], 0, 11, { signal: new AbortController().signal });
		assert.equal(result, null);
		editor.setText("/rev");
		editor.handleInput("\t");
		await settle();
		assert.equal(editor.isShowingAutocomplete(), true);
		editor.handleInput("\t");
		assert.equal(editor.getText(), "/review ");
	});

	await check("accepting with Enter preserves Pi's submit behavior", async () => {
		const { editor } = setup();
		let submitted;
		editor.onSubmit = text => { submitted = text; };
		editor.setText("Context\n");
		await type(editor, "/rev");
		editor.handleInput("\r");
		assert.equal(submitted, "Context\nReview changes.\nReport correctness.");
	});

	assert.ok(readFileSync(promptPath, "utf8").includes("${1:-correctness}"));
	console.log(`\n${passed} regression checks passed against Pi ${JSON.parse(readFileSync(join(dirname(agentEntry), "../package.json"), "utf8")).version}.`);
} finally {
	rmSync(fixtureDir, { recursive: true, force: true });
}
