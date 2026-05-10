const vscode = require('vscode');
const http = require('http');
const { AntigravitySDK } = require('antigravity-sdk');

let server;
let sdk;

async function activate(context) {
    console.log('✨ VibeCode Bridge is now active!');

    try {
        sdk = new AntigravitySDK(context);
        await sdk.initialize();
        context.subscriptions.push(sdk);
        console.log('Antigravity SDK initialized');
    } catch (e) {
        console.error('Failed to initialize Antigravity SDK:', e);
    }

    let disposable = vscode.commands.registerCommand('vibecode.startBridge', function () {
        startServer();
    });

    context.subscriptions.push(disposable);

    // Start server automatically so it's always ready
    startServer();
}

function startServer() {
    if (server) return;

    server = http.createServer((req, res) => {
        // Handle CORS from Chrome extension
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/send-prompt') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.prompt) {
                        handlePrompt(data);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok' }));
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (req.method === 'POST' && req.url === '/improve-prompt') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.prompt) {
                        const improved = await improvePrompt(data.prompt);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ improvedPrompt: improved }));
                    } else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'No prompt provided' }));
                    }
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(31337, '127.0.0.1', () => {
        console.log('VibeCode Bridge Server listening on port 31337');
    });
}

async function handlePrompt(data) {
    let promptText = typeof data === 'string' ? data : data.prompt;
    const chatType = data.chatType || 'same';
    const model = data.model || 'auto';
    const project = data.project || 'antigravity';
    const files = data.files || [];

    // Robust detection of saveToFile intent
    const saveToFile = data.saveToFile === true ||
        data.saveToFile === 'true' ||
        data.outputTarget === 'file' ||
        (typeof data.outputTarget === 'string' && data.outputTarget.toLowerCase() === 'file');

    const fileName = data.fileName || data.taskFileName || 'tasks.md';

    console.log(`[VibeCode] Bridge Received Prompt:`);
    console.log(` - Project: ${project}`);
    console.log(` - Target: ${data.outputTarget || 'default'}`);
    console.log(` - SaveToFile: ${saveToFile}`);
    console.log(` - FileName: ${fileName}`);
    console.log(` - ChatType: ${chatType}`);
    console.log(` - Prompt Length: ${promptText ? promptText.length : 0} chars`);

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (saveToFile) {
            console.log(`[VibeCode] Entering saveToFile flow...`);
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('❌ VibeCode: Cannot save to file - No workspace folder is open.');
                return;
            }

            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);

            console.log(`[VibeCode] Appending to file: ${filePath}`);

            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const timestamp = new Date().toLocaleString();
            const separator = '\n\n' + '='.repeat(50) + '\n';
            const header = `[VibeCode Capture: ${timestamp}]\n`;
            const content = (fs.existsSync(filePath) ? separator : '') + header + promptText + '\n';

            fs.appendFileSync(filePath, content);
            vscode.window.showInformationMessage(`✨ VibeCode: Prompt appended to ${fileName}`);
            return;
        }

        if (files.length > 0 && workspaceFolders && workspaceFolders.length > 0) {
            const fs = require('fs');
            const path = require('path');
            const tempDir = path.join(workspaceFolders[0].uri.fsPath, '.vibecode_uploads');

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            let fileRefs = [];
            for (const file of files) {
                // file.data is base64 data url like: data:image/png;base64,iVBORw0KGgo...
                const matches = file.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const buffer = Buffer.from(matches[2], 'base64');
                    const filePath = path.join(tempDir, file.name);
                    fs.writeFileSync(filePath, buffer);
                    fileRefs.push(filePath);
                }
            }
            if (fileRefs.length > 0) {
                promptText += '\n\nAttached files for reference:\n' + fileRefs.map(f => `- ${f}`).join('\n');
            }
        }

        if (model !== 'auto') {
            promptText = `[Please use model: ${model}]\n\n` + promptText;
        }

        const commands = await vscode.commands.getCommands(true);

        if (chatType === 'new') {
            // Try to open a new chat before sending prompt
            const newChatCmd = commands.find(c => c === 'aichat.newchataction' || c === 'workbench.action.chat.newChat');
            if (newChatCmd) {
                await vscode.commands.executeCommand(newChatCmd);
                // small delay to let new chat open
                await new Promise(r => setTimeout(r, 500));
            }
        }

        if (project === 'antigravity' && sdk && sdk.cascade) {
            try {
                // If new chat requested, we might need a small delay or specific command
                // but for now we ensure the prompt is sent to the SDK
                await sdk.cascade.sendPrompt(promptText);
                vscode.window.showInformationMessage('✨ VibeCode: Prompt injected via Antigravity SDK!');
                return;
            } catch (err) {
                console.error("Antigravity SDK injection failed:", err);
            }
        }

        if (project === 'vscode') {
            try {
                // For VS Code, 'workbench.action.chat.open' with query usually auto-runs.
                // If they want 'paste only', we'd use a different approach, but this is the standard API.
                await vscode.commands.executeCommand('workbench.action.chat.open', { query: promptText });
                vscode.window.showInformationMessage('✨ VibeCode: Prompt injected via VS Code API!');
                return;
            } catch (e) {
                console.error("VS Code API injection failed:", e);
            }
        }

        if (project === 'cursor') {
            try {
                await vscode.env.clipboard.writeText(promptText);
                await vscode.commands.executeCommand('cursor.chat.focus');
                setTimeout(async () => {
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                    vscode.window.showInformationMessage('✨ VibeCode: Prompt injected via Cursor SDK fallback!');
                }, 500);
                return;
            } catch (e) {
                console.error("Cursor SDK injection failed:", e);
            }
        }

        // Potential commands to try with direct injection (Only commands that actually support args)
        const directCommands = [
            { cmd: 'workbench.action.chat.open', args: [{ query: promptText }] }
        ];

        let injected = false;
        for (const { cmd, args } of directCommands) {
            if (commands.includes(cmd)) {
                try {
                    await vscode.commands.executeCommand(cmd, ...args);
                    vscode.window.showInformationMessage('✨ VibeCode: Prompt received and injected!');
                    injected = true;
                    break;
                } catch (err) {
                    console.error(`Command ${cmd} failed:`, err);
                }
            }
        }

        if (injected) return;

        // Clipboard Paste Workaround
        // Prioritize Antigravity commands
        const antigravityCommand = commands.find(c =>
            c.toLowerCase().includes('antigravity') && (c.toLowerCase().includes('focus') || c.toLowerCase().includes('chat') || c.toLowerCase().includes('open'))
        );

        const fallbackCommand = antigravityCommand || commands.find(c =>
            c === 'aichat.newchataction' ||
            c === 'workbench.action.chat.open' ||
            c === 'cursor.chat.focus' ||
            c.endsWith('.chat.open') ||
            c.includes('chat.open')
        );

        if (fallbackCommand) {
            try {
                await vscode.env.clipboard.writeText(promptText);
                await vscode.commands.executeCommand(fallbackCommand);
                setTimeout(async () => {
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                    vscode.window.showInformationMessage(`✨ VibeCode: Prompt pasted via fallback (${fallbackCommand})`);
                }, 500);
                return;
            } catch (err) {
                console.error(`Fallback paste with ${fallbackCommand} failed:`, err);
            }
        }

        // Ultimate fallback
        vscode.env.clipboard.writeText(promptText);
        vscode.window.showInformationMessage('✨ VibeCode v0.1: Prompt copied to clipboard! (Chat injection API not supported by this specific IDE version)');

    } catch (err) {
        console.error("Fatal error in handlePrompt:", err);
        vscode.env.clipboard.writeText(promptText);
        vscode.window.showInformationMessage('✨ VibeCode v0.1: Prompt copied to clipboard! (Chat injection API not supported by this specific IDE version)');
    }
}

async function improvePrompt(text) {
    try {
        const models = await vscode.lm.selectChatModels({ family: 'gemini' });
        if (models && models.length > 0) {
            const messages = [
                vscode.LanguageModelChatMessage.User("You are an expert prompt engineer. Improve this prompt for an AI coding assistant. Make it highly clear, descriptive, and actionable. Return ONLY the improved prompt text, with no introduction, quotes, or markdown formatting blocks unless it's code. Here is the prompt: " + text)
            ];
            const chatResponse = await models[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            let result = '';
            for await (const fragment of chatResponse.text) {
                result += fragment;
            }
            return result.trim();
        }

        // Fallback if gemini isn't available
        const allModels = await vscode.lm.selectChatModels();
        if (allModels && allModels.length > 0) {
            const messages = [
                vscode.LanguageModelChatMessage.User("Improve this prompt for an AI coding assistant. Return ONLY the improved prompt: " + text)
            ];
            const chatResponse = await allModels[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            let result = '';
            for await (const fragment of chatResponse.text) {
                result += fragment;
            }
            return result.trim();
        }
    } catch (e) {
        console.error("LM API failed:", e);
    }
    // Return original if AI fails
    return "Please help me with the following task in a professional and clear manner: " + text;
}

function deactivate() {
    if (server) {
        server.close();
        server = null;
    }
}

module.exports = {
    activate,
    deactivate
}
