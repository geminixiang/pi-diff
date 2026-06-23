const http = require("node:http");
const { execFile } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { promisify } = require("node:util");
const Diff2Html = require("diff2html");

const execFileAsync = promisify(execFile);
const diffCss = readFileSync(require.resolve("diff2html/bundles/css/diff2html.min.css"), "utf8");

let server;
let url;

function shlex(input) {
	return (input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map((part) =>
		part.replace(/^['"]|['"]$/g, ""),
	);
}

async function gitDiff(cwd, args) {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["diff", "--no-ext-diff", "--no-color", ...args],
			{ cwd, maxBuffer: 50 * 1024 * 1024 },
		);
		return stdout;
	} catch (error) {
		throw new Error(error.stderr || error.message);
	}
}

function page(diff, cwd, args) {
	const body = diff.trim()
		? Diff2Html.html(diff, {
			drawFileList: true,
			matching: "lines",
			outputFormat: "line-by-line",
		})
		: '<p class="empty">No diff.</p>';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pi-diff</title>
<link rel="stylesheet" href="/diff2html.css">
<style>
	body { margin: 0; background: #f6f8fa; color: #24292f; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
	header { position: sticky; top: 0; z-index: 1; padding: 12px 20px; background: #fff; border-bottom: 1px solid #d0d7de; }
	h1 { display: inline; margin: 0 12px 0 0; font-size: 18px; }
	.meta { color: #57606a; font-size: 12px; }
	.wrap { max-width: 1280px; margin: 16px auto; padding: 0 16px; }
	.d2h-file-wrapper { border-color: #d0d7de; border-radius: 6px; }
	.d2h-file-header { background: #f6f8fa; border-bottom-color: #d0d7de; }
	.empty { padding: 40px; text-align: center; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; color: #57606a; }
</style>
</head>
<body>
<header><h1>pi-diff</h1><span class="meta">${escapeHtml(cwd)} · git diff ${escapeHtml(args.join(" "))}</span></header>
<main class="wrap">${body}</main>
</body>
</html>`;
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

async function openBrowser(target) {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
	execFile(command, args, { stdio: "ignore", detached: true }).unref();
}

module.exports = function piDiff(pi) {
	pi.registerCommand("pi-diff", {
		description: "Open git diff in a GitHub-like browser view",
		handler: async (args, ctx) => {
			const diffArgs = shlex(args || "");
			if (server) server.close();

			server = http.createServer(async (req, res) => {
				if (req.url === "/diff2html.css") {
					res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
					res.end(diffCss);
					return;
				}

				try {
					const diff = await gitDiff(ctx.cwd, diffArgs);
					res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
					res.end(page(diff, ctx.cwd, diffArgs));
				} catch (error) {
					res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
					res.end(error.message);
				}
			});

			await new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", resolve);
			});

			const { port } = server.address();
			url = `http://127.0.0.1:${port}/`;
			await openBrowser(url);
			ctx.ui.notify(`pi-diff opened: ${url}`, "info");
		},
	});

	pi.on("session_shutdown", () => {
		server?.close();
		server = undefined;
		url = undefined;
	});
};
