import { Plugin, PluginSettingTab, Setting, App, TFile, HeadingCache } from "obsidian";

interface PluginSettings {
	// Theme
	enableThemeCSS: boolean;
	markdownBgColor: string;
	codeBlockRadius: number;
	checkboxStrikethrough: boolean;
	// Chat Bubbles
	chatRBubbleColor: string;
	chatLBubbleColor: string;
	chatBubbleMaxWidth: number;
	// Outline Injection
	enableOutlineInjection: boolean;
	injectChatR: boolean;
	injectChatL: boolean;
	chatRPrefix: string;
	chatLPrefix: string;
	headingLevel: number;
	maxDisplayLength: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
	enableThemeCSS: true,
	markdownBgColor: "#F8F4F2",
	codeBlockRadius: 14,
	checkboxStrikethrough: false,
	chatRBubbleColor: "#F9E3D0",
	chatLBubbleColor: "#F9E3D0",
	chatBubbleMaxWidth: 75,
	enableOutlineInjection: true,
	injectChatR: true,
	injectChatL: true,
	chatRPrefix: "",
	chatLPrefix: "",
	headingLevel: 1,
	maxDisplayLength: 80,
};

export default class ChatCalloutOutlinePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private _calloutCache: Map<string, HeadingCache[]> = new Map();
	private _updating = false;
	private _originalGetFileCache: ((file: TFile) => ReturnType<typeof this.app.metadataCache.getFileCache>) | null = null;
	private _styleEl: HTMLStyleElement | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ChatCalloutOutlineSettingTab(this.app, this));

		// Inject dynamic CSS
		this._styleEl = document.createElement("style");
		this._styleEl.id = "chat-bubble-theme-dynamic";
		document.head.appendChild(this._styleEl);
		this._applyCSS();

		// Monkey-patch metadataCache.getFileCache
		this._originalGetFileCache = this.app.metadataCache.getFileCache.bind(
			this.app.metadataCache
		);
		this.app.metadataCache.getFileCache = (file: TFile) => {
			return this._patchedGetFileCache(file);
		};

		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				if (this._updating) return;
				this._updateCallouts(file);
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const file = this.app.workspace.getActiveFile();
				if (file) this._updateCallouts(file);
			})
		);

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) this._updateCallouts(activeFile);
	}

	onunload() {
		if (this._originalGetFileCache) {
			this.app.metadataCache.getFileCache = this._originalGetFileCache;
		}
		this._calloutCache.clear();
		if (this._styleEl) this._styleEl.remove();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Dynamic CSS ──────────────────────────────────────────────

	_applyCSS() {
		if (!this._styleEl) return;
		this._styleEl.textContent = this.settings.enableThemeCSS
			? this._generateCSS()
			: "";
	}

	private _generateCSS(): string {
		const s = this.settings;
		const bg = s.markdownBgColor;
		const radius = s.codeBlockRadius + "px";
		const chatRBg = s.chatRBubbleColor;
		const chatLBg = s.chatLBubbleColor;
		const chatMaxW = s.chatBubbleMaxWidth + "%";

		const textColor = "rgb(38, 35, 32)";
		const headingColor = "rgb(49, 45, 42)";
		const borderColor = "rgb(217, 199, 184)";
		const qBorderColor = "rgb(207, 201, 198)";
		const headerBg = "rgb(250, 239, 228)";

		let css = `
/* ===== Markdown Area Background ===== */
.markdown-preview-view,
.markdown-reading-view .markdown-preview-view {
  background-color: ${bg};
}
.markdown-source-view.mod-cm6 .cm-scroller {
  background-color: ${bg};
}

/* ===== Typography ===== */
.markdown-preview-view,
.markdown-source-view.mod-cm6 .cm-scroller {
  color: ${textColor};
  line-height: 1.8;
}
.markdown-preview-view {
  padding: 2em 3em;
}
.markdown-preview-view p {
  margin-bottom: 0.8em;
}

/* ===== Headings ===== */
.markdown-preview-view h1,
.markdown-preview-view h2,
.markdown-preview-view h3,
.markdown-preview-view h4,
.markdown-preview-view h5,
.markdown-preview-view h6,
.markdown-rendered h1,
.markdown-rendered h2,
.markdown-rendered h3,
.markdown-rendered h4,
.markdown-rendered h5,
.markdown-rendered h6 {
  color: ${headingColor};
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.6em;
  border-bottom: none;
  padding-bottom: 0;
}
.markdown-preview-view h1, .markdown-rendered h1 { font-size: 1.8em; }
.markdown-preview-view h2, .markdown-rendered h2 { font-size: 1.4em; padding-bottom: 0.3em; }
.markdown-preview-view h3, .markdown-rendered h3 { font-size: 1.2em; }
.markdown-preview-view h4, .markdown-rendered h4 { font-size: 1.0em; }

/* ===== Horizontal Rule ===== */
.markdown-preview-view hr,
.markdown-rendered hr,
body .markdown-preview-view hr,
body .markdown-rendered hr {
  border: none;
  border-top: 1px solid ${borderColor};
  margin: 2em 0;
  background-color: ${borderColor};
  background: ${borderColor};
  height: 1px;
  color: ${borderColor};
}
.theme-light, .theme-dark { --hr-color: ${borderColor}; }

/* ===== Blockquote ===== */
.theme-light, .theme-dark {
  --blockquote-border-color: ${qBorderColor};
  --blockquote-border-thickness: 3px;
  --blockquote-background-color: transparent;
}
.markdown-preview-view blockquote,
.markdown-rendered blockquote,
body .markdown-preview-view blockquote,
body .markdown-rendered blockquote {
  border-left: 3px solid ${qBorderColor};
  border-right: none; border-top: none; border-bottom: none;
  background-color: transparent;
  padding: 0.4em 1.2em;
  margin: 1em 0;
  color: ${textColor};
  font-weight: 600;
  font-style: normal;
}
.markdown-preview-view blockquote p,
.markdown-rendered blockquote p { margin: 0.3em 0; }

/* ===== Table ===== */
.markdown-preview-view table, .markdown-rendered table {
  width: 100%; border-collapse: separate; border-spacing: 0;
  margin: 1.5em 0; font-size: 0.95em;
  border: 1px solid ${borderColor}; border-radius: 8px;
  overflow: hidden; background-color: ${bg};
}
.markdown-preview-view table thead tr th:first-child,
.markdown-rendered table thead tr th:first-child { border-top-left-radius: 8px; }
.markdown-preview-view table thead tr th:last-child,
.markdown-rendered table thead tr th:last-child { border-top-right-radius: 8px; }
.markdown-preview-view table tbody tr:last-child td:first-child,
.markdown-rendered table tbody tr:last-child td:first-child { border-bottom-left-radius: 8px; }
.markdown-preview-view table tbody tr:last-child td:last-child,
.markdown-rendered table tbody tr:last-child td:last-child { border-bottom-right-radius: 8px; }
.markdown-preview-view table thead tr, .markdown-rendered table thead tr { background-color: ${headerBg}; }
.markdown-preview-view table th, .markdown-rendered table th {
  font-weight: 700; color: ${headingColor}; text-align: left;
  padding: 0.8em 1.2em;
  border-bottom: 1px solid ${borderColor}; border-right: 1px solid ${borderColor};
  border-top: none; border-left: none;
  background-color: ${headerBg}; font-size: 1em;
}
.markdown-preview-view table th:last-child, .markdown-rendered table th:last-child { border-right: none; }
.markdown-preview-view table td, .markdown-rendered table td {
  padding: 0.75em 1.2em;
  border-bottom: 1px solid ${borderColor}; border-right: 1px solid ${borderColor};
  border-top: none; border-left: none;
  color: ${textColor}; font-weight: 400; background-color: ${bg};
}
.markdown-preview-view table td:last-child, .markdown-rendered table td:last-child { border-right: none; }
.markdown-preview-view table tbody tr:last-child td,
.markdown-rendered table tbody tr:last-child td { border-bottom: none; }
.markdown-preview-view table tr:hover th, .markdown-rendered table tr:hover th,
.markdown-preview-view table thead tr:hover th, .markdown-rendered table thead tr:hover th { background-color: ${headerBg}; }
.markdown-preview-view table tr:hover td, .markdown-rendered table tr:hover td,
.markdown-preview-view table tbody tr:hover td, .markdown-rendered table tbody tr:hover td,
.markdown-preview-view table tr:hover, .markdown-rendered table tr:hover { background-color: ${bg}; }

/* ===== Links ===== */
.markdown-preview-view a, .markdown-rendered a {
  color: #A0522D; text-decoration: none;
  border-bottom: 1px solid transparent; transition: border-bottom 0.2s ease;
}
.markdown-preview-view a:hover, .markdown-rendered a:hover { border-bottom: 1px solid #A0522D; }

/* ===== Inline Code ===== */
.markdown-preview-view code:not(pre code), .markdown-rendered code:not(pre code) {
  background-color: #F0E8DC; color: #8B4513;
  padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em;
}

/* ===== Code Block ===== */
.markdown-preview-view pre, .markdown-rendered pre {
  background-color: rgb(29, 26, 23); border: none;
  border-radius: ${radius}; padding: 0; position: relative;
}
.markdown-preview-view pre::before, .markdown-rendered pre::before {
  content: ""; position: absolute; top: 2.8em; left: 1.2em; right: 1.2em;
  height: 1px; background-color: rgb(74, 72, 69); z-index: 1;
}
.markdown-preview-view pre code, .markdown-rendered pre code {
  color: #D4D4D4; background-color: transparent; display: block;
  padding: 4.0em 1.4em 1.2em 1.4em;
}
.markdown-preview-view pre[class*="language-"]::after,
.markdown-rendered pre[class*="language-"]::after {
  content: var(--cb-lang, "") !important;
  position: absolute !important; top: calc(0.4em + 2px) !important;
  left: 0.8em !important; right: auto !important; width: auto !important;
  color: #FFFFFF !important; font-family: var(--font-default) !important;
  font-size: 0.85em !important; font-weight: 500 !important;
  line-height: 2em !important; height: 2em !important;
  background: transparent !important; border: none !important;
  border-radius: 999px !important; padding: 0 0.6em !important;
  margin: 0 !important; box-sizing: border-box !important;
  opacity: 1 !important; z-index: 2 !important;
  display: flex !important; align-items: center !important;
  overflow: hidden !important; pointer-events: none !important;
}
pre[class~="language-c"] { --cb-lang: "C"; }
pre[class~="language-r"] { --cb-lang: "R"; }
pre[class~="language-go"] { --cb-lang: "Go"; }
pre[class~="language-cs"], pre[class~="language-csharp"] { --cb-lang: "C#"; }
pre[class~="language-cpp"] { --cb-lang: "C++"; }
pre[class~="language-css"] { --cb-lang: "CSS"; }
pre[class~="language-php"] { --cb-lang: "PHP"; }
pre[class~="language-sql"] { --cb-lang: "SQL"; }
pre[class~="language-lua"] { --cb-lang: "Lua"; }
pre[class~="language-ini"] { --cb-lang: "INI"; }
pre[class~="language-xml"] { --cb-lang: "XML"; }
pre[class~="language-java"] { --cb-lang: "Java"; }
pre[class~="language-ruby"], pre[class~="language-rb"] { --cb-lang: "Ruby"; }
pre[class~="language-rust"], pre[class~="language-rs"] { --cb-lang: "Rust"; }
pre[class~="language-dart"] { --cb-lang: "Dart"; }
pre[class~="language-perl"] { --cb-lang: "Perl"; }
pre[class~="language-scss"] { --cb-lang: "SCSS"; }
pre[class~="language-json"] { --cb-lang: "JSON"; }
pre[class~="language-html"] { --cb-lang: "HTML"; }
pre[class~="language-yaml"], pre[class~="language-yml"] { --cb-lang: "YAML"; }
pre[class~="language-toml"] { --cb-lang: "TOML"; }
pre[class~="language-shell"], pre[class~="language-bash"], pre[class~="language-sh"] { --cb-lang: "Shell"; }
pre[class~="language-swift"] { --cb-lang: "Swift"; }
pre[class~="language-scala"] { --cb-lang: "Scala"; }
pre[class~="language-regex"] { --cb-lang: "Regex"; }
pre[class~="language-latex"], pre[class~="language-tex"] { --cb-lang: "LaTeX"; }
pre[class~="language-python"], pre[class~="language-py"] { --cb-lang: "Python"; }
pre[class~="language-kotlin"], pre[class~="language-kt"] { --cb-lang: "Kotlin"; }
pre[class~="language-docker"], pre[class~="language-dockerfile"] { --cb-lang: "Docker"; }
pre[class~="language-graphql"] { --cb-lang: "GraphQL"; }
pre[class~="language-markdown"], pre[class~="language-md"] { --cb-lang: "Markdown"; }
pre[class~="language-javascript"], pre[class~="language-js"] { --cb-lang: "JavaScript"; }
pre[class~="language-typescript"], pre[class~="language-ts"] { --cb-lang: "TypeScript"; }
pre[class~="language-powershell"] { --cb-lang: "PowerShell"; }

/* ---- Copy button ---- */
.markdown-preview-view pre .copy-code-button, .markdown-rendered pre .copy-code-button {
  position: absolute !important; top: 0.4em !important; right: 0.8em !important;
  left: auto !important; width: auto !important; color: transparent !important;
  font-size: 0.85em !important; line-height: 2em !important; height: 2em !important;
  background: transparent !important; border: none !important;
  border-radius: 999px !important; padding: 0 0.6em !important;
  opacity: 1 !important; visibility: visible !important; cursor: pointer !important;
  z-index: 4 !important; display: flex !important; align-items: center !important;
  gap: 0.3em !important; overflow: hidden !important;
  transition: background-color 0.15s ease !important;
}
.markdown-preview-view pre .copy-code-button:hover,
.markdown-rendered pre .copy-code-button:hover { background-color: rgba(255,255,255,0.1) !important; }
.markdown-preview-view pre .copy-code-button svg, .markdown-rendered pre .copy-code-button svg {
  width: 1em !important; height: 1em !important; color: #FFFFFF !important;
  stroke: #FFFFFF !important; flex-shrink: 0 !important;
}
.markdown-preview-view pre .copy-code-button::after, .markdown-rendered pre .copy-code-button::after {
  content: "Copy" !important; font-family: var(--font-default) !important;
  font-size: 0.85rem !important; font-weight: 500 !important; color: #FFFFFF !important;
}

/* ===== Bold & Italic ===== */
.markdown-preview-view strong, .markdown-rendered strong { color: ${headingColor}; font-weight: 700; }
.markdown-preview-view em, .markdown-rendered em { color: #5C4A38; }

/* ===== Lists ===== */
.markdown-preview-view ul, .markdown-preview-view ol,
.markdown-rendered ul, .markdown-rendered ol { padding-left: 1.5em; margin-bottom: 0.8em; }
.markdown-preview-view li, .markdown-rendered li { margin-bottom: 0.3em; }
.markdown-preview-view ul > li::marker, .markdown-rendered ul > li::marker { color: ${headingColor}; }
.list-bullet::after { background-color: ${headingColor}; }

/* ===== Chat Bubble Callouts ===== */
.callout[data-callout="chat-r"], .callout[data-callout="chat-r"]:hover,
.callout[data-callout="chat-l"], .callout[data-callout="chat-l"]:hover {
  display: flex; background: none; background-color: transparent;
  border: none; box-shadow: none; padding: 0; margin: 0.05em 0;
  mix-blend-mode: normal; outline: none; cursor: default;
}
.callout[data-callout="chat-r"] .callout-title,
.callout[data-callout="chat-l"] .callout-title { display: none; }
.callout[data-callout="chat-r"] .callout-content,
.callout[data-callout="chat-l"] .callout-content {
  color: ${textColor}; border-radius: 22px; padding: 0.9em 1.6em;
  max-width: ${chatMaxW}; display: inline-block;
  font-weight: 400; font-size: 1em; line-height: 1.6; width: fit-content;
}
.callout[data-callout="chat-r"] .callout-content p,
.callout[data-callout="chat-l"] .callout-content p { margin: 0; }
.callout[data-callout="chat-r"], .callout[data-callout="chat-r"]:hover { justify-content: flex-end; }
.callout[data-callout="chat-r"] .callout-content { background-color: ${chatRBg}; margin-left: auto; }
.callout[data-callout="chat-l"], .callout[data-callout="chat-l"]:hover { justify-content: flex-start; }
.callout[data-callout="chat-l"] .callout-content { background-color: ${chatLBg}; margin-right: auto; }
`;

		if (!s.checkboxStrikethrough) {
			css += `
/* ===== Checkbox — No Strikethrough ===== */
.HyperMD-task-line[data-task="x"],
.HyperMD-task-line[data-task="X"],
.HyperMD-task-line[data-task="x"] span,
.HyperMD-task-line[data-task="X"] span,
.HyperMD-task-line[data-task="x"] .cm-list-1,
.HyperMD-task-line[data-task="X"] .cm-list-1 { text-decoration: none !important; }
.markdown-rendered .task-list-item.is-checked,
.markdown-rendered .task-list-item.is-checked p,
.markdown-rendered .task-list-item.is-checked a,
.markdown-rendered .task-list-item.is-checked span,
.markdown-rendered .task-list-item[data-task="x"],
.markdown-rendered .task-list-item[data-task="x"] p,
.markdown-rendered .task-list-item[data-task="X"],
.markdown-rendered .task-list-item[data-task="X"] p { text-decoration: none !important; }
`;
		}

		return css;
	}

	// ── Outline injection ────────────────────────────────────────

	private _patchedGetFileCache(file: TFile) {
		if (!this._originalGetFileCache) return null;
		const cache = this._originalGetFileCache(file);
		if (!cache || !file) return cache;
		if (!this.settings.enableOutlineInjection) return cache;

		const calloutHeadings = this._calloutCache.get(file.path);
		if (!calloutHeadings || calloutHeadings.length === 0) return cache;

		const realHeadings = cache.headings || [];
		const merged = [...realHeadings, ...calloutHeadings];
		merged.sort((a, b) => a.position.start.line - b.position.start.line);
		return { ...cache, headings: merged };
	}

	private async _updateCallouts(file: TFile) {
		if (!file || file.extension !== "md") return;
		try {
			const content = await this.app.vault.cachedRead(file);
			const calloutHeadings = this._parseCallouts(content);
			this._calloutCache.set(file.path, calloutHeadings);
			this._updating = true;
			this.app.metadataCache.trigger("changed", file);
			this._updating = false;
		} catch {
			this._updating = false;
		}
	}

	private _parseCallouts(content: string): HeadingCache[] {
		const lines = content.split("\n");
		const headings: HeadingCache[] = [];
		let offset = 0;
		const maxLen = this.settings.maxDisplayLength;
		const level = this.settings.headingLevel;
		const injectR = this.settings.injectChatR;
		const injectL = this.settings.injectChatL;
		const prefixR = this.settings.chatRPrefix;
		const prefixL = this.settings.chatLPrefix;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const matchR = /^> \[!chat-r\]\s*$/.test(line);
			const matchL = /^> \[!chat-l\]\s*$/.test(line);

			if (matchR || matchL) {
				if (matchR && !injectR) { offset += line.length + 1; continue; }
				if (matchL && !injectL) { offset += line.length + 1; continue; }

				const textParts: string[] = [];
				let endLine = i;
				let endCol = line.length;

				for (let j = i + 1; j < lines.length; j++) {
					const nextLine = lines[j]!;
					if (/^> .+/.test(nextLine)) {
						textParts.push(nextLine.slice(2));
						endLine = j;
						endCol = nextLine.length;
					} else {
						break;
					}
				}

				let endOffset = offset;
				for (let k = i; k <= endLine; k++) {
					endOffset += lines[k]!.length + 1;
				}
				endOffset -= 1;

				if (textParts.length > 0) {
					const prefix = matchR ? prefixR : prefixL;
					const raw = textParts.join(" ").trim();
					const headingText = prefix ? prefix + " " + raw : raw;
					const displayText =
						headingText.length > maxLen
							? headingText.slice(0, maxLen - 3) + "..."
							: headingText;

					headings.push({
						heading: displayText,
						level: level,
						position: {
							start: { line: i, col: 0, offset: offset },
							end: { line: endLine, col: endCol, offset: endOffset },
						},
					});
				}
			}

			offset += line.length + 1;
		}

		return headings;
	}
}

// ── Settings Tab ─────────────────────────────────────────────

class ChatCalloutOutlineSettingTab extends PluginSettingTab {
	plugin: ChatCalloutOutlinePlugin;

	constructor(app: App, plugin: ChatCalloutOutlinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Theme ──
		containerEl.createEl("h3", { text: "Theme" });

		new Setting(containerEl)
			.setName("Enable theme")
			.setDesc("Apply the warm theme CSS to markdown views.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.enableThemeCSS).onChange(async (v) => {
					this.plugin.settings.enableThemeCSS = v;
					await this.plugin.saveSettings();
					this.plugin._applyCSS();
				})
			);

		new Setting(containerEl)
			.setName("Markdown background color")
			.addColorPicker((cp) =>
				cp.setValue(this.plugin.settings.markdownBgColor).onChange(async (v) => {
					this.plugin.settings.markdownBgColor = v;
					await this.plugin.saveSettings();
					this.plugin._applyCSS();
				})
			);

		new Setting(containerEl)
			.setName("Code block corner radius")
			.setDesc("Border radius for code blocks in pixels (0–30).")
			.addSlider((s) =>
				s.setLimits(0, 30, 1).setValue(this.plugin.settings.codeBlockRadius)
					.setDynamicTooltip().onChange(async (v) => {
						this.plugin.settings.codeBlockRadius = v;
						await this.plugin.saveSettings();
						this.plugin._applyCSS();
					})
			);

		new Setting(containerEl)
			.setName("Checkbox strikethrough")
			.setDesc("Show strikethrough on completed checkboxes.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkboxStrikethrough).onChange(async (v) => {
					this.plugin.settings.checkboxStrikethrough = v;
					await this.plugin.saveSettings();
					this.plugin._applyCSS();
				})
			);

		// ── Chat Bubbles ──
		containerEl.createEl("h3", { text: "Chat Bubbles" });

		new Setting(containerEl)
			.setName("User bubble color (chat-r)")
			.addColorPicker((cp) =>
				cp.setValue(this.plugin.settings.chatRBubbleColor).onChange(async (v) => {
					this.plugin.settings.chatRBubbleColor = v;
					await this.plugin.saveSettings();
					this.plugin._applyCSS();
				})
			);

		new Setting(containerEl)
			.setName("Response bubble color (chat-l)")
			.addColorPicker((cp) =>
				cp.setValue(this.plugin.settings.chatLBubbleColor).onChange(async (v) => {
					this.plugin.settings.chatLBubbleColor = v;
					await this.plugin.saveSettings();
					this.plugin._applyCSS();
				})
			);

		new Setting(containerEl)
			.setName("Bubble max width")
			.setDesc("Maximum width of chat bubbles as a percentage (30–100%).")
			.addSlider((s) =>
				s.setLimits(30, 100, 5).setValue(this.plugin.settings.chatBubbleMaxWidth)
					.setDynamicTooltip().onChange(async (v) => {
						this.plugin.settings.chatBubbleMaxWidth = v;
						await this.plugin.saveSettings();
						this.plugin._applyCSS();
					})
			);

		// ── Outline Injection ──
		containerEl.createEl("h3", { text: "Outline Injection" });

		new Setting(containerEl)
			.setName("Enable outline injection")
			.setDesc("Inject chat callouts as headings in the outline panel.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.enableOutlineInjection).onChange(async (v) => {
					this.plugin.settings.enableOutlineInjection = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Inject chat-r (user questions)")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.injectChatR).onChange(async (v) => {
					this.plugin.settings.injectChatR = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Inject chat-l (responses)")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.injectChatL).onChange(async (v) => {
					this.plugin.settings.injectChatL = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Chat-r prefix")
			.setDesc("Text prepended to user questions in the outline (e.g. \"Q:\").")
			.addText((t) =>
				t.setPlaceholder("e.g. Q:").setValue(this.plugin.settings.chatRPrefix)
					.onChange(async (v) => {
						this.plugin.settings.chatRPrefix = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Chat-l prefix")
			.setDesc("Text prepended to responses in the outline (e.g. \"A:\").")
			.addText((t) =>
				t.setPlaceholder("e.g. A:").setValue(this.plugin.settings.chatLPrefix)
					.onChange(async (v) => {
						this.plugin.settings.chatLPrefix = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Heading level")
			.setDesc("Outline heading level for injected callouts (1–6).")
			.addSlider((s) =>
				s.setLimits(1, 6, 1).setValue(this.plugin.settings.headingLevel)
					.setDynamicTooltip().onChange(async (v) => {
						this.plugin.settings.headingLevel = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max display length")
			.setDesc("Truncate callout text in the outline after this many characters.")
			.addSlider((s) =>
				s.setLimits(30, 200, 10).setValue(this.plugin.settings.maxDisplayLength)
					.setDynamicTooltip().onChange(async (v) => {
						this.plugin.settings.maxDisplayLength = v;
						await this.plugin.saveSettings();
					})
			);
	}
}
