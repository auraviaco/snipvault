import * as vscode from 'vscode';
import * as fs from 'fs';

interface Snippet {
    id: number;
    name: string;
    tags: string[];
    code: string;
}

export function activate(context: vscode.ExtensionContext) {
    const deletePopupCommand = vscode.commands.registerCommand(
    "auravia.deleteSnippetPopup",
    async () => {

        const snippets = context.globalState.get<Snippet[]>("auraviaSnippets") ?? [];

        if (snippets.length === 0) {
            vscode.window.showInformationMessage("No snippets to delete.");
            return;
        }

        const selected = await vscode.window.showQuickPick(
            snippets.map(s => ({
                label: s.name,
                description: s.tags.join(", "),
                snippet: s
            })),
            {
                placeHolder: "Select snippet to delete"
            }
        );

        if (!selected) return;

        const confirm = await vscode.window.showWarningMessage(
            `Delete snippet "${selected.label}"?`,
            { modal: true },
            "Yes"
        );

        if (confirm === "Yes") {
            const updated = snippets.filter(s => s.id !== selected.snippet.id);
            await context.globalState.update("auraviaSnippets", updated);
            provider.refresh();
            vscode.window.showInformationMessage("Snippet deleted.");
        }
    }
);

context.subscriptions.push(deletePopupCommand);

    const insertPopupCommand = vscode.commands.registerCommand(
    "auravia.insertSnippetPopup",
    async () => {

        const snippets = context.globalState.get<Snippet[]>("auraviaSnippets") ?? [];

        if (snippets.length === 0) {
            vscode.window.showInformationMessage("No snippets available.");
            return;
        }

        const selected = await vscode.window.showQuickPick(
            snippets.map(s => ({
                label: s.name,
                description: s.tags.join(", "),
                snippet: s
            })),
            {
                placeHolder: "Select snippet to insert"
            }
        );

        if (!selected) return;

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.insertSnippet(new vscode.SnippetString(selected.snippet.code));
        }
    }
);

context.subscriptions.push(insertPopupCommand);

    const deleteAllCommand = vscode.commands.registerCommand(
    "auravia.deleteAllSnippets",
    async () => {

        const confirm = await vscode.window.showWarningMessage(
            "Are you sure you want to delete ALL snippets?",
            { modal: true },
            "Yes"
        );

        if (confirm === "Yes") {
            await context.globalState.update("auraviaSnippets", []);
            provider.refresh();
            vscode.window.showInformationMessage("All snippets deleted.");
        }
    }
);

context.subscriptions.push(deleteAllCommand);


    const getSnippets = (): Snippet[] => {
        return context.globalState.get<Snippet[]>("auraviaSnippets") ?? [];
    };

    const saveSnippets = async (snippets: Snippet[]): Promise<void> => {
        await context.globalState.update("auraviaSnippets", snippets);
    };

    const provider = new SnippetProvider(context);
    vscode.window.registerTreeDataProvider("snipvaultSidebar", provider);

    const saveCommand = vscode.commands.registerCommand('auravia.saveSnippet', async () => {

        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText) {
            vscode.window.showErrorMessage("Select code first.");
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: "Enter unique snippet name"
        });

        if (!name) { return; }

        const snippets = getSnippets();

        if (snippets.some(s => s.name === name)) {
            vscode.window.showErrorMessage("Snippet name must be unique.");
            return;
        }

        const tagsInput = await vscode.window.showInputBox({
            prompt: "Enter tags separated by comma"
        });

        const tags = tagsInput ? tagsInput.split(",").map((t: string) => t.trim()) : [];

        snippets.push({
            id: Date.now(),
            name,
            tags,
            code: selectedText
        });

        await saveSnippets(snippets);
        provider.refresh();
        vscode.window.showInformationMessage("Snippet saved.");
    });

    const exportCommand = vscode.commands.registerCommand("auravia.exportSnippets", async () => {

        const snippets = getSnippets();
        if (snippets.length === 0) {
            vscode.window.showInformationMessage("No snippets to export.");
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON Files': ['json'] },
            defaultUri: vscode.Uri.file('snipvault-snippets.json')
        });

        if (!uri) { return; }

        fs.writeFileSync(uri.fsPath, JSON.stringify(snippets, null, 2));
        vscode.window.showInformationMessage("Exported successfully.");
    });

    const importCommand = vscode.commands.registerCommand("auravia.importSnippets", async () => {

        const uri = await vscode.window.showOpenDialog({
            filters: { 'JSON Files': ['json'] },
            canSelectMany: false
        });

        if (!uri || uri.length === 0) { return; }

        const fileContent = fs.readFileSync(uri[0].fsPath, 'utf-8');
        const imported: Snippet[] = JSON.parse(fileContent);

        const existing = getSnippets();

        imported.forEach(snippet => {
            if (!existing.some(e => e.name === snippet.name)) {
                existing.push(snippet);
            }
        });

        await saveSnippets(existing);
        provider.refresh();
        vscode.window.showInformationMessage("Imported successfully.");
    });

    context.subscriptions.push(saveCommand, exportCommand, importCommand);
}

class SnippetItem extends vscode.TreeItem {

    constructor(public readonly snippet: Snippet) {
        super(snippet.name, vscode.TreeItemCollapsibleState.None);

        this.description = snippet.tags.join(", ");
        this.tooltip = snippet.code;

        this.command = {
            command: 'auravia.insertSnippet',
            title: 'Insert',
            arguments: [snippet]
        };
    }
}

class SnippetProvider implements vscode.TreeDataProvider<SnippetItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<SnippetItem | undefined | void> =
        new vscode.EventEmitter<SnippetItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<SnippetItem | undefined | void> =
        this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {

        vscode.commands.registerCommand("auravia.insertSnippet", (snippet: Snippet) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.insertSnippet(new vscode.SnippetString(snippet.code));
            }
        });

        vscode.commands.registerCommand("auravia.deleteSnippet", async (snippet: Snippet) => {
            const snippets = this.getSnippets().filter(s => s.id !== snippet.id);
            await this.context.globalState.update("auraviaSnippets", snippets);
            this.refresh();
        });
    }

    getSnippets(): Snippet[] {
        return this.context.globalState.get<Snippet[]>("auraviaSnippets") ?? [];
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SnippetItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Promise<SnippetItem[]> {
        const snippets = this.getSnippets();
        return Promise.resolve(snippets.map(s => new SnippetItem(s)));
    }
}

export function deactivate() {}
