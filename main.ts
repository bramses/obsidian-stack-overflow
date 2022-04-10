import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	request,
	Setting,
} from "obsidian";
// import { parse, default as HTMLElement } from "node-html-parser/dist/nodes/html.js";
import parse, { HTMLElement } from "node-html-parser";

interface StackOverflowAnswerSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: StackOverflowAnswerSettings = {
	mySetting: "default",
};

export default class StackOverflowAnswers extends Plugin {
	settings: StackOverflowAnswerSettings;

	extractAnswerId(url: string) {
		if (url.includes('#')) // in form of https://stackoverflow.com/questions/14122919/how-to-hide-show-objects-using-three-js-release-54/14123978#14123978
			return url.split("#").pop();
		
		const urlPopped = url.split("/"); // in form of https://stackoverflow.com/a/32232028/3952024
		urlPopped.pop();
		return urlPopped.pop(); // second to last
			
	}

	extractParagraphs(html: HTMLElement) {
		const paragraphs: string [] = []
		
		html.querySelectorAll("p").forEach((p) => {
			const linksSelectors = p.querySelectorAll("a");
			const links: string[] = [];

			if (linksSelectors.length > 0) {
				linksSelectors.forEach((link) => {
					const href = link.getAttribute("href");
					const src = link.innerText
					links.push(href ? href : src);
				});

				let idx = 0;
				p.innerHTML = p.innerHTML.replace(/<\s*a[^>]*>(.*?)<\s*\/\s*a>/g, (match) => { return links[idx++] }).replace(/<code>/g, '`').replace(/<\/code>/g, '`');
				paragraphs.push(p.innerHTML);
			} else {
				paragraphs.push(p.innerHTML.replace(/<code>/g, '`').replace(/<\/code>/g, '`'));
			}
		});

		return paragraphs;
	}

	extractCodeBlocks(html: HTMLElement) {
		const codeBlocks: string [] = []

		html.querySelectorAll("pre").forEach((pre) => {
			codeBlocks.push(pre.innerText.replace('<code>', '').replace('</code>', ''));
		});

		return codeBlocks;
	}

	generateMarkdown (paragraphs: string [], codeBlocks: string [], url: string) {
		let markdown = "";

		paragraphs.forEach((p) => {
			markdown += `> ${p}\n>\n`;
		});

		codeBlocks.forEach((c) => {
			markdown += `\`\`\`\n${c}\n\`\`\`\n\n`;
		});

		markdown += `\n\n[View on Stack Overflow](${url})`;

		return markdown;
	}

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Sample Plugin",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				new Notice("This is a notice!");
			}
		);


		const url = "https://stackoverflow.com/a/32232028/3952024"

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

		const struct = root.getElementById(`answer-${this.extractAnswerId(url)}`).querySelector('div.js-post-body');
		const ps = this.extractParagraphs(struct);
		const cbs = this.extractCodeBlocks(struct);

		const markdown = this.generateMarkdown(ps, cbs, url);
		console.log(markdown);

		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);
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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: StackOverflowAnswers;

	constructor(app: App, plugin: StackOverflowAnswers) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

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
