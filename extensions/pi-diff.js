const http = require("node:http");
const { execFile } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { promisify } = require("node:util");
const Diff2Html = require("diff2html");

const execFileAsync = promisify(execFile);
const diffCss = readFileSync(require.resolve("diff2html/bundles/css/diff2html.min.css"), "utf8");

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

function diffHtml(diff) {
	return diff.trim()
		? Diff2Html.html(diff, {
			colorScheme: "dark",
			diffMaxChanges: 3000,
			diffMaxLineLength: 2000,
			diffTooBigMessage: () => "Diff too large to render. Narrow the path or commit range.",
			drawFileList: true,
			matching: "none",
			outputFormat: "side-by-side",
		})
		: '<p class="empty">No diff.</p>';
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

async function view(cwd, pathname, diffArgs) {
	if (pathname === "/") {
		return {
			title: "Working tree",
			command: `git diff ${diffArgs.join(" ")}`,
			diff: await git(cwd, ["diff", "--no-ext-diff", "--no-color", ...diffArgs]),
		};
	}
	if (pathname === "/staged") {
		return { title: "Staged", command: "git diff --cached", diff: await git(cwd, ["diff", "--cached", "--no-ext-diff", "--no-color"]) };
	}

	const match = pathname.match(/^\/commit\/([0-9a-f]{7,40})$/i);
	if (match) {
		const [commit] = match.slice(1);
		const title = (await git(cwd, ["show", "-s", "--format=%h %s", commit])).trim();
		return { title, command: `git show ${commit}`, diff: await git(cwd, ["show", "--format=", "--no-ext-diff", "--no-color", commit]) };
	}

	throw new Error("Not found");
}

function page({ cwd, currentPath, title, command, diff, commits }) {
	const list = commits.map((commit) => {
		const path = `/commit/${commit.sha}`;
		const active = currentPath === path ? " active" : "";
		return `<a class="commit${active}" href="${path}"><b>${escapeHtml(commit.shortSha)}</b> ${escapeHtml(commit.subject)}<span>${escapeHtml(commit.when)}</span></a>`;
	}).join("");

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
		--header-h: 52px;
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: var(--bg); color: var(--text); font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
	a { color: inherit; text-decoration: none; }

	header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; height: var(--header-h); padding: 0 16px; background: #010409; border-bottom: 1px solid var(--border); }
	h1 { margin: 0; font-size: 16px; white-space: nowrap; }
	.meta { flex: 1 1 auto; min-width: 0; color: var(--dim); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.menu-toggle { display: none; flex: 0 0 auto; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; font-size: 16px; }
	.menu-toggle:hover { background: var(--panel-2); }

	.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; max-width: 1600px; margin: 16px auto; padding: 0 16px; }
	.sidebar { position: sticky; top: calc(var(--header-h) + 9px); align-self: start; max-height: calc(100vh - var(--header-h) - 18px); overflow: auto; }
	.nav, .commits { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 12px; }
	.nav a, .commit { display: block; padding: 10px 12px; border-bottom: 1px solid var(--border); }
	.nav a:last-child, .commit:last-child { border-bottom: 0; }
	.nav a.active, .commit.active, .nav a:hover, .commit:hover { background: var(--panel-2); }
	.nav a.active, .commit.active { box-shadow: inset 3px 0 0 var(--brand); }
	.commit { color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.commit span { display: block; color: var(--dim); font-size: 12px; margin-top: 2px; }
	.content { min-width: 0; }
	.content h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; word-break: break-word; }

	.scrim { display: none; position: fixed; inset: var(--header-h) 0 0; z-index: 8; background: rgba(1, 4, 9, .6); }

	.d2h-wrapper { width: 100%; }
	.d2h-file-list-wrapper { position: sticky; top: calc(var(--header-h) + 9px); z-index: 1; max-height: min(50vh, 420px); overflow: auto; border-color: var(--brand); box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand) 40%, transparent); }
	.d2h-file-list-header { position: sticky; top: 0; z-index: 1; padding: 10px 12px; cursor: pointer; user-select: none; background: var(--panel); }
	.d2h-file-list-header::before { content: "▾"; display: inline-block; margin-right: 6px; color: var(--dim); transition: transform .15s ease; }
	.d2h-file-list-wrapper.collapsed { max-height: none; overflow: visible; }
	.d2h-file-list-wrapper.collapsed .d2h-file-list-header::before { transform: rotate(-90deg); }
	.d2h-file-list-wrapper.collapsed .d2h-file-list { display: none; }
	/* The library's hide/show links are redundant now the header is the toggle. */
	.d2h-file-switch { display: none; }
	.d2h-file-wrapper { border-color: var(--border); border-radius: 8px; overflow: hidden; scroll-margin-top: calc(var(--header-h) + 56px); }
	.d2h-file-header { align-items: center; box-sizing: border-box; height: auto; min-height: 44px; background: linear-gradient(90deg, color-mix(in srgb, var(--brand) 22%, var(--panel)), var(--panel)); border-bottom-color: var(--border); }
	.d2h-file-header .d2h-file-name-wrapper { flex: 1 1 auto; min-width: 0; width: auto; }
	.d2h-file-header .d2h-file-name { min-width: 0; }
	.d2h-file-collapse { display: flex; flex: 0 0 auto; margin-left: 12px; color: #c9d1d9; font-size: 12px; line-height: 1; }
	.d2h-file-wrapper.collapsed .d2h-files-diff { display: none; }
	.d2h-file-wrapper.collapsed .d2h-file-header { opacity: .75; }
	.empty { padding: 40px; text-align: center; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; color: var(--dim); }

	/* Narrow screens: collapse side-by-side panes into a stacked column so each
	   pane gets the full width, and turn the sidebar into an off-canvas drawer. */
	@media (max-width: 900px) {
		.menu-toggle { display: flex; }
		.layout { grid-template-columns: minmax(0, 1fr); gap: 0; margin: 12px auto; padding: 0 10px; }
		.sidebar {
			position: fixed; top: var(--header-h); left: 0; z-index: 9;
			width: min(85vw, 320px); max-height: none; height: calc(100vh - var(--header-h));
			padding: 12px; background: var(--bg); border-right: 1px solid var(--border);
			transform: translateX(-100%); transition: transform .2s ease;
		}
		body.menu-open .sidebar { transform: translateX(0); }
		body.menu-open .scrim { display: block; }
		.d2h-file-list-wrapper, .d2h-file-wrapper { border-radius: 6px; }
	}
</style>
</head>
<body>
<header>
	<button class="menu-toggle" type="button" aria-label="Toggle commits">☰</button>
	<h1>pi-diff</h1>
	<span class="meta">${escapeHtml(cwd)} · ${escapeHtml(command)}</span>
</header>
<div class="scrim"></div>
<main class="layout">
	<aside class="sidebar">
		<nav class="nav">
			<a class="${currentPath === "/" ? "active" : ""}" href="/">Working tree</a>
			<a class="${currentPath === "/staged" ? "active" : ""}" href="/staged">Staged</a>
		</nav>
		<section class="commits">${list || '<div class="commit">No commits</div>'}</section>
	</aside>
	<section class="content"><h2>${escapeHtml(title)}</h2>${diffHtml(diff)}</section>
</main>
<script>
	(() => {
		const toggle = document.querySelector(".menu-toggle");
		const scrim = document.querySelector(".scrim");
		const close = () => document.body.classList.remove("menu-open");
		toggle?.addEventListener("click", () => document.body.classList.toggle("menu-open"));
		scrim?.addEventListener("click", close);
		document.querySelector(".sidebar")?.addEventListener("click", (event) => {
			if (event.target.closest("a")) close();
		});
		addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
	})();

	document.querySelectorAll(".d2h-file-wrapper").forEach((file) => {
		const viewed = file.querySelector(".d2h-file-collapse-input");
		if (!viewed) return;
		viewed.addEventListener("change", () => {
			file.classList.toggle("collapsed", viewed.checked);
			viewed.closest(".d2h-file-collapse")?.classList.toggle("d2h-selected", viewed.checked);
		});
	});

	document.querySelectorAll(".d2h-file-list-wrapper").forEach((list) => {
		const header = list.querySelector(".d2h-file-list-header");
		const set = (collapsed) => list.classList.toggle("collapsed", collapsed);
		// Header is the toggle; start collapsed so a long file list never covers the diff.
		header?.addEventListener("click", () => set(!list.classList.contains("collapsed")));
		// Jumping to a file shouldn't leave the (re-covering) list open.
		list.querySelectorAll(".d2h-file-name").forEach((link) => link.addEventListener("click", () => set(true)));
		set(true);
	});
</script>
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
			ctx.ui.notify(`pi-diff opened: ${url}`, "info");
		},
	});

	pi.on("session_shutdown", () => {
		server?.close();
		server = undefined;
	});
};
