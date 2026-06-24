const http = require("node:http");
const { execFile } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const diffCss = readFileSync(require.resolve("diff2html/bundles/css/diff2html.min.css"), "utf8");
const diffUiJs = readFileSync(require.resolve("diff2html/bundles/js/diff2html-ui-base.min.js"), "utf8");

let server;

function shlex(input) {
	if (/[\\"']/.test(input)) throw new Error("Quoted/escaped args are not supported; pass plain git diff args.");
	return input.trim() ? input.trim().split(/\s+/) : [];
}

async function git(cwd, args) {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 50 * 1024 * 1024 });
		return stdout;
	} catch (error) {
		throw new Error(error.stderr || error.message);
	}
}

async function commits(cwd) {
	try {
		await git(cwd, ["rev-parse", "--verify", "HEAD"]);
	} catch {
		return [];
	}

	const output = await git(cwd, ["log", "--date=relative", "--pretty=format:%H%x09%h%x09%cr%x09%s", "-n", "50"]);
	return output.split("\n").filter(Boolean).map((line) => {
		const [sha, shortSha, when, ...subject] = line.split("\t");
		return { sha, shortSha, when, subject: subject.join("\t") };
	});
}

function extractFiles(diff) {
	const files = [];
	const seen = new Set();
	for (const line of diff.split("\n")) {
		const match = line.match(/^diff --git "?(.+?)"? "?(.+?)"?$/);
		if (!match) continue;
		let path = match[2];
		if (path.startsWith("b/")) path = path.slice(2);
		if (!seen.has(path)) {
			seen.add(path);
			files.push(path);
		}
	}
	return files;
}

async function view(cwd, pathname, diffArgs) {
	if (pathname === "/") {
		const diff = await git(cwd, ["diff", "--no-ext-diff", "--no-color", ...diffArgs]);
		return { title: "Working tree", command: `git diff ${diffArgs.join(" ")}`, diff, files: extractFiles(diff) };
	}
	if (pathname === "/staged") {
		const diff = await git(cwd, ["diff", "--cached", "--no-ext-diff", "--no-color"]);
		return { title: "Staged", command: "git diff --cached", diff, files: extractFiles(diff) };
	}

	const match = pathname.match(/^\/commit\/([0-9a-f]{7,40})$/i);
	if (match) {
		const [commit] = match.slice(1);
		const title = (await git(cwd, ["show", "-s", "--format=%h %s", commit])).trim();
		const diff = await git(cwd, ["show", "--format=", "--no-ext-diff", "--no-color", commit]);
		return { title, command: `git show ${commit}`, diff, files: extractFiles(diff) };
	}

	throw new Error("Not found");
}

function page({ cwd, currentPath, title, command, diff, files, commits }) {
	const commitList = commits.map((commit) => {
		const path = `/commit/${commit.sha}`;
		const active = currentPath === path ? " active" : "";
		return `<a class="commit${active}" href="${path}"><b>${escapeHtml(commit.shortSha)}</b> ${escapeHtml(commit.subject)}<span>${escapeHtml(commit.when)}</span></a>`;
	}).join("");

	const fileList = files.map((path, index) =>
		`<button class="file" type="button" data-index="${index}"><span class="file-path">${escapeHtml(path)}</span></button>`
	).join("");

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pi-diff</title>
<link rel="stylesheet" href="/diff2html.css">
<style>
	:root {
		--brand: #7c3aed;
		--bg: #0d1117;
		--panel: #161b22;
		--panel-2: #21262d;
		--border: #30363d;
		--text: #e6edf3;
		--dim: #8b949e;
		--header-h: 42px;
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: var(--bg); color: var(--text); font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
	a { color: inherit; text-decoration: none; }
	button { font: inherit; color: inherit; cursor: pointer; }

	header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; height: var(--header-h); padding: 0 12px; background: #010409; border-bottom: 1px solid var(--border); }
	h1 { margin: 0; font-size: 15px; white-space: nowrap; }
	.meta { flex: 1 1 auto; min-width: 0; color: var(--dim); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.github-link { display: flex; flex: 0 0 auto; color: var(--dim); }
	.github-link:hover { color: var(--text); }
	.menu-toggle { display: none; flex: 0 0 auto; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; font-size: 14px; }
	.menu-toggle:hover { background: var(--panel-2); }

	.toolbar__controls { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
	.segmented-control { display: flex; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
	.segmented-control button { padding: 5px 10px; border: 0; background: transparent; color: var(--dim); font-size: 12px; }
	.segmented-control button.is-active { background: var(--brand); color: #fff; }
	.segmented-control button:hover:not(.is-active) { background: var(--panel-2); color: var(--text); }

	.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; width: 100%; margin: 0 0 12px; padding: 0 12px; }
	.sidebar { position: sticky; top: calc(var(--header-h) + 9px); align-self: start; max-height: calc(100vh - var(--header-h) - 18px); overflow: auto; }
	.nav, .commits, .files { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 12px; }
	.nav a, .commit, .file { display: block; width: 100%; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--border); background: transparent; text-align: left; }
	.nav a:last-child, .commit:last-child, .file:last-child { border-bottom: 0; }
	.nav a.active, .commit.active, .nav a:hover, .commit:hover, .file:hover { background: var(--panel-2); }
	.nav a.active, .commit.active { box-shadow: inset 3px 0 0 var(--brand); }
	.commit { color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.commit span { display: block; color: var(--dim); font-size: 12px; margin-top: 2px; }
	.file { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
	.file-path { display: block; overflow: hidden; text-overflow: ellipsis; }
	.files__empty { padding: 12px; color: var(--dim); font-size: 12px; text-align: center; }
	.content { min-width: 0; }
	.content h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; word-break: break-word; }

	.scrim { display: none; position: fixed; inset: var(--header-h) 0 0; z-index: 8; background: rgba(1, 4, 9, .6); }

	.d2h-file-list-wrapper { position: sticky; top: var(--header-h); z-index: 1; max-height: min(50vh, 420px); overflow: auto; border-color: var(--brand); box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand) 40%, transparent); cursor: pointer; }
	.d2h-file-list { cursor: default; }
	.d2h-file-list-header { padding: 8px 10px; }
	.d2h-file-header { background: linear-gradient(90deg, color-mix(in srgb, var(--brand) 22%, var(--panel)), var(--panel)); }
	.d2h-file-header.d2h-sticky-header { top: calc(var(--header-h) + var(--file-list-h, 0px)); }
	.empty { padding: 40px; text-align: center; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; color: var(--dim); }

	@media (max-width: 900px) {
		.menu-toggle { display: flex; }
		.layout { grid-template-columns: minmax(0, 1fr); gap: 0; margin: 0 0 8px; padding: 0; }
		.sidebar {
			position: fixed; top: var(--header-h); left: 0; z-index: 9;
			width: min(85vw, 320px); max-height: none; height: calc(100vh - var(--header-h));
			padding: 8px; background: var(--bg); border-right: 1px solid var(--border);
			transform: translateX(-100%); transition: transform .2s ease;
		}
		body.menu-open .sidebar { transform: translateX(0); }
		body.menu-open .scrim { display: block; }
		.toolbar__controls { display: none; }
	}
</style>
</head>
<body>
<header>
	<button class="menu-toggle" type="button" aria-label="Toggle commits">☰</button>
	<h1>pi-diff</h1>
	<span class="meta">${escapeHtml(cwd)} · ${escapeHtml(command)}</span>
	<div class="toolbar__controls">
		<div class="segmented-control" role="tablist" aria-label="Diff view mode">
			<button class="view-mode" data-mode="line-by-line" type="button">Unified</button>
			<button class="view-mode" data-mode="side-by-side" type="button">Split</button>
		</div>
	</div>
	<a class="github-link" href="https://github.com/geminixiang/pi-diff" target="_blank" rel="noreferrer" aria-label="GitHub repository">
		<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.87c.68 0 1.36.09 2 .26 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
	</a>
</header>
<div class="scrim"></div>
<main class="layout">
	<aside class="sidebar">
		<nav class="nav">
			<a class="${currentPath === "/" ? "active" : ""}" href="/">Working tree</a>
			<a class="${currentPath === "/staged" ? "active" : ""}" href="/staged">Staged</a>
		</nav>
		<section class="files">
			${fileList || '<div class="files__empty">No files</div>'}
		</section>
		<section class="commits">${commitList || '<div class="commit">No commits</div>'}</section>
	</aside>
	<section class="content"><div id="diff">${diff.trim() ? "" : '<p class="empty">No diff.</p>'}</div></section>
</main>
<script src="/diff2html-ui.js"></script>
<script>
	(() => {
		const toggle = document.querySelector(".menu-toggle");
		const scrim = document.querySelector(".scrim");
		const close = () => document.body.classList.remove("menu-open");
		toggle?.addEventListener("click", () => document.body.classList.toggle("menu-open"));
		scrim?.addEventListener("click", close);
		document.querySelector(".sidebar")?.addEventListener("click", (event) => {
			if (event.target.closest("a, .file")) close();
		});
		addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
	})();

	const diff = ${scriptJson(diff)};
	const files = ${scriptJson(files)};
	if (diff.trim()) {
		let outputFormat = matchMedia("(max-width: 900px)").matches ? "line-by-line" : "side-by-side";
		const container = document.getElementById("diff");
		const modeButtons = document.querySelectorAll(".view-mode");

		function updateModeButtons() {
			modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === outputFormat));
		}

		function assignFileAnchors() {
			document.querySelectorAll(".d2h-file-wrapper").forEach((wrapper, index) => wrapper.id = "file-" + index);
		}

		function wireFileListCollapse() {
			const fileList = document.querySelector(".d2h-file-list-wrapper");
			if (!fileList) return;
			new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--file-list-h", (entry.borderBoxSize?.[0]?.blockSize || fileList.offsetHeight) + "px")).observe(fileList);
			fileList.addEventListener("click", (event) => {
				if (event.target.closest(".d2h-file-list, .d2h-file-switch")) return;
				const show = fileList.querySelector(".d2h-show");
				fileList.querySelector(show?.style.display === "none" ? ".d2h-hide" : ".d2h-show")?.click();
			});
		}

		function draw() {
			container.innerHTML = "";
			new Diff2HtmlUI(container, diff, {
				colorScheme: "dark",
				diffMaxChanges: 3000,
				diffMaxLineLength: 2000,
				diffTooBigMessage: () => "Diff too large to render. Narrow the path or commit range.",
				highlight: false,
				matching: "none",
				outputFormat,
			}).draw();
			assignFileAnchors();
			wireFileListCollapse();
			updateModeButtons();
		}

		modeButtons.forEach((button) => button.addEventListener("click", () => {
			outputFormat = button.dataset.mode;
			draw();
		}));

		draw();

		const fileItems = Array.from(document.querySelectorAll(".file"));

		fileItems.forEach((item) => item.addEventListener("click", () => {
			const index = item.dataset.index;
			const target = document.getElementById("file-" + index);
			if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
		}));
	}
</script>
</body>
</html>`;
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function scriptJson(value) {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function openBrowser(target) {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
	execFile(command, args, { stdio: "ignore", detached: true }).unref();
}

module.exports = function piDiff(pi) {
	pi.registerCommand("diff", {
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
				if (req.url === "/diff2html-ui.js") {
					res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
					res.end(diffUiJs);
					return;
				}

				try {
					const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
					if (pathname === "/favicon.ico") {
						res.writeHead(204);
						res.end();
						return;
					}
					const data = await view(ctx.cwd, pathname, diffArgs);
					res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
					res.end(page({ cwd: ctx.cwd, currentPath: pathname, commits: await commits(ctx.cwd), ...data }));
				} catch (error) {
					const notFound = error.message === "Not found";
					res.writeHead(notFound ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
					res.end(error.message);
				}
			});

			await new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", resolve);
			});

			const { port } = server.address();
			const url = `http://127.0.0.1:${port}/`;
			await openBrowser(url);
			ctx.ui.notify(`diff opened: ${url}`, "info");
			const link = `\x1b]8;;${url}\x1b\\open\x1b]8;;\x1b\\`;
			ctx.ui.setStatus("diff", ctx.ui.theme.fg("accent", `diff ${link}`));
		},
	});

	pi.on("session_shutdown", (_event, ctx) => {
		server?.close();
		server = undefined;
		ctx.ui.setStatus("diff", undefined);
	});
};
