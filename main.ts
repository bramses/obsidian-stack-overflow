// many thanks to https://github.com/zolrath/obsidian-auto-link-title for in cursor replace code and the inspiration
import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	request,
	Setting,
} from "obsidian";
import parse, { HTMLElement } from "node-html-parser";
import { EditorExtensions } from "editor-enhancements";


interface StackOverflowAnswerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: StackOverflowAnswerSettings = {
	mySetting: "default",
};

export default class StackOverflowAnswers extends Plugin {
	settings: StackOverflowAnswerSettings;

	extractAnswerId(url: string) {
		if (url.includes("#"))
			// in form of https://stackoverflow.com/questions/14122919/how-to-hide-show-objects-using-three-js-release-54/14123978#14123978
			return url.split("#").pop();

		const urlPopped = url.split("/"); // in form of https://stackoverflow.com/a/32232028/3952024
		urlPopped.pop();
		return urlPopped.pop(); // second to last
	}

	extractParagraphs(html: HTMLElement) {
		const paragraphs: string[] = [];

		html.querySelectorAll("p").forEach((p) => {
			const linksSelectors = p.querySelectorAll("a");
			const links: string[] = [];

			if (linksSelectors.length > 0) {
				linksSelectors.forEach((link) => {
					const href = link.getAttribute("href");
					const src = link.innerText;
					links.push(href ? href : src);
				});

				let idx = 0;
				p.innerHTML = p.innerHTML
					.replace(/<\s*a[^>]*>(.*?)<\s*\/\s*a>/g, (match) => {
						return links[idx++];
					})
					.replace(/<code>/g, "`")
					.replace(/<\/code>/g, "`");
				paragraphs.push(p.innerHTML);
			} else {
				paragraphs.push(
					p.innerHTML
						.replace(/<code>/g, "`")
						.replace(/<\/code>/g, "`")
				);
			}
		});

		return paragraphs;
	}

	extractCodeBlocks(html: HTMLElement) {
		const codeBlocks: string[] = [];

		html.querySelectorAll("pre").forEach((pre) => {
			codeBlocks.push(
				pre.innerText.replace("<code>", "").replace("</code>", "")
			);
		});

		return codeBlocks;
	}

	generateMarkdown(paragraphs: string[], codeBlocks: string[], url: string, question: string, questionURL: string) {
		let markdown = "";

		markdown += '\n\n---'

		markdown += `\n\n# [${question}](https://stackoverflow.com/${questionURL})\n\n`;

		paragraphs.forEach((p) => {
			markdown += `> ${p}\n>\n`;
		});

		codeBlocks.forEach((c) => {
			markdown += `\`\`\`\n${c}\n\`\`\`\n\n`
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
		});

		markdown += `\n\n[View Answer on Stack Overflow](${url})`;

		markdown += "\n\n---\n";

		return markdown;
	}

	async conveyorBelt(url = "") {
		if (url.length === 0) {
			new Notice("[Stack Overflow Answers] - Nothing Selected");
			return;
		}

		if (!url.includes("stackoverflow.com")) {
			new Notice("[Stack Overflow Answers] - Invalid URL");
			return;
		}

		const res = await request({
			url: url,
		});
		const root = parse(res, {
			lowerCaseTagName: false, // convert tag name to lower case (hurts performance heavily)
			comment: false, // retrieve comments (hurts performance slightly)
			blockTextElements: {
				script: false, // keep text content when parsing
				noscript: true, // keep text content when parsing
				style: false, // keep text content when parsing
				pre: true, // keep text content when parsing
			},
		});

		const struct = root
			.getElementById(`answer-${this.extractAnswerId(url)}`)
			.querySelector("div.js-post-body");

		const question = root.getElementById("question-header").querySelector('a').innerText;
		const questionURL = root.getElementById("question-header").querySelector('a').getAttribute("href");
		
		const ps = this.extractParagraphs(struct);
		const cbs = this.extractCodeBlocks(struct);

		const markdown = this.generateMarkdown(ps, cbs, url, question, questionURL);
		return markdown;
	}

	// Custom hashid by @shabegom
	private createBlockHash(): string {
		let result = "";
		const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
		const charactersLength = characters.length;
		for (let i = 0; i < 4; i++) {
			result += characters.charAt(
				Math.floor(Math.random() * charactersLength)
			);
		}
		return result;
	}

	async convertUrlToTitledLink(editor: Editor, url: string): Promise<void> {
		// Generate a unique id for find/replace operations for the title.
		const pasteId = `Fetching Answer#${this.createBlockHash()}`;

		// Instantly paste so you don't wonder if paste is broken
		editor.replaceSelection(`${pasteId}`);

		// Fetch title from site, replace Fetching Title with actual title
		const stackOverflowMarkdown = await this.conveyorBelt(url);

		const text = editor.getValue();

		const start = text.indexOf(pasteId);
		if (start < 0) {
			console.log(
				`Unable to find text "${pasteId}" in current editor, bailing out; link ${url}`
			);
		} else {
			const end = start + pasteId.length;
			const startPos = EditorExtensions.getEditorPositionFromIndex(
				text,
				start
			);
			const endPos = EditorExtensions.getEditorPositionFromIndex(
				text,
				end
			);

			editor.replaceRange(stackOverflowMarkdown, startPos, endPos);
		}
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "insert-stack-overflow-answer",
			name: "Insert Stack Overflow Answer",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selectedText = (EditorExtensions.getSelectedText(editor) || "").trim();
				this.convertUrlToTitledLink(editor, selectedText);
				// const markdown = await this.conveyorBelt(editor.getSelection());
				// editor.replaceSelection(markdown);
			},
			hotkeys: [
				{
					modifiers: ["Mod", "Shift"],
					key: "v",
				},
			],
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new StackOverflowAnswerSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class StackOverflowAnswerSettingsTab extends PluginSettingTab {
	plugin: StackOverflowAnswers;

	constructor(app: App, plugin: StackOverflowAnswers) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Settings for Stack Overflow Answers",
		});

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						console.log("Secret: " + value);
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
