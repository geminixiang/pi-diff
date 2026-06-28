const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const vm = require("node:vm");

const lib = { require, module: { exports: {} }, process, setTimeout, clearTimeout, setInterval, clearInterval };
vm.runInNewContext(readFileSync("extensions/pi-diff.js", "utf8"), lib);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
	assert.deepEqual(Array.from(lib.shlex(" --stat  README.md ")), ["--stat", "README.md"]);
	assert.throws(() => lib.shlex('--output="foo bar.patch"'), /not supported/);
	assert.throws(() => lib.shlex("foo\\ bar.txt"), /not supported/);

	assert.equal(lib.githubUrl("git@github.com:owner/repo.git"), "https://github.com/owner/repo");
	assert.equal(lib.githubUrl("https://github.com/owner/repo.git\n"), "https://github.com/owner/repo");
	assert.equal(lib.githubUrl("https://gitlab.com/owner/repo.git"), null);

	const html = lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: "</script>", files: ["a.js", "b.js"], signatures: { "a.js": "123" }, viewed: { "a.js": "123" }, commits: [], repo: { url: "https://github.com/owner/repo", branch: "feature/x" } });
	assert.match(html, /diff2html-ui\.js/);
	assert.match(html, /new Diff2HtmlUI/);
	assert.match(html, /compare\/feature%2Fx\?expand=1/);
	assert.match(html, /tree\/feature%2Fx/);
	assert.match(html, /<title>pi-diff · feature\/x<\/title>/);
	assert.match(html, /<span class="meta">\. · feature\/x · git diff<\/span>/);
	assert.match(html, /class="logo" href="https:\/\/github\.com\/owner\/repo"/);

	const htmlNoRepo = lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: "", files: [], commits: [], repo: { url: null, branch: null } });
	assert.match(htmlNoRepo, /<span class="logo">pi-diff<\/span>/);
	assert.match(htmlNoRepo, /<link id="server-icon" rel="icon"/);
	assert.match(htmlNoRepo, /<span class="server-dot" title="Diff server connected" aria-label="Diff server connected"><\/span>/);
	assert.match(htmlNoRepo, /const events = new EventSource\("\/events"\)/);
	assert.match(htmlNoRepo, /events\.onopen = \(\) => setServerOnline\(true\)/);
	assert.match(htmlNoRepo, /events\.onerror = \(\) => setServerOnline\(false\)/);
	assert.doesNotMatch(htmlNoRepo, /Restart \/diff/);
	assert.doesNotMatch(htmlNoRepo, /<a class="icon-link"/);
	const extracted = lib.extractFiles("diff --git a/old.txt b/new.txt\ndiff --git a/foo b/foo");
	assert.equal(extracted.length, 2);
	assert.equal(extracted[0], "new.txt");
	assert.equal(extracted[1], "foo");
	assert.equal(lib.extractFiles("not a diff").length, 0);
	assert.deepEqual(Array.from(lib.statusFiles(" M a.js\0?? new.txt\0R  next.txt\0old.txt\0")), ["a.js", "new.txt", "next.txt"]);

	{
		let calls = 0;
		const state = lib.createMonitorState({ debounceMs: 5, changeKey: async () => { calls++; return "same"; }, notify: () => {} });
		state.cwd = ".";
		state.lastKey = "same";
		lib.scheduleReloadCheck("first", state);
		lib.scheduleReloadCheck("second", state);
		await wait(30);
		assert.equal(calls, 1);
		await lib.stopChangeMonitor(state);
	}

	{
		let calls = 0;
		let notifications = 0;
		let release;
		const state = lib.createMonitorState({
			debounceMs: 0,
			changeKey: async () => {
				calls++;
				if (calls === 1) await new Promise((resolve) => { release = resolve; });
				return "changed";
			},
			notify: () => { notifications++; },
			ignoredRoots: async () => [],
		});
		state.cwd = ".";
		state.lastKey = "initial";
		lib.scheduleReloadCheck("first", state, 0);
		await wait(10);
		lib.scheduleReloadCheck("during-flight", state, 0);
		release();
		await wait(30);
		assert.equal(calls, 2);
		assert.equal(notifications, 1);
		await lib.stopChangeMonitor(state);
	}

	{
		const closed = [];
		const state = lib.createMonitorState();
		state.cwd = ".";
		state.debounceTimer = setTimeout(() => {}, 1000);
		state.safetyTimer = setInterval(() => {}, 1000);
		state.workingWatcher = { close: async () => { closed.push("working"); } };
		state.gitWatcher = { close: async () => { closed.push("git"); } };
		await lib.stopChangeMonitor(state);
		assert.deepEqual(closed.sort(), ["git", "working"]);
		assert.equal(state.cwd, null);
		assert.equal(state.workingWatcher, null);
		assert.equal(state.gitWatcher, null);
	}

	assert.match(html, /line-by-line.*side-by-side/);
	assert.match(html, /view-mode/);
	assert.doesNotMatch(html, /file-viewed|sidebar-checkbox|file-click/);
	assert.match(html, /d2h-file-collapse-input/);
	assert.match(html, /dataset\.signature/);
	assert.match(html, /fetch\("\/viewed"/);
	assert.match(html, /keepalive: true/);
	assert.match(html, /d2h-d-none/);
	assert.match(html, /setTimeout\(syncDiffViewed, 0\)/);
	assert.doesNotMatch(html, /diff-mobile|diff-desktop|d2h-file-side-diff/);

	const cwd = mkdtempSync(join(tmpdir(), "pi-diff-test-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		assert.equal(await lib.gitDir(cwd), join(cwd, ".git"));
		assert.deepEqual(Array.from(await lib.commits(cwd)), []);
		await assert.rejects(() => lib.view(cwd, "/nope", []), /Not found/);
		execFileSync("node", ["-e", "require('node:fs').writeFileSync('new.txt', 'hello\\n')"], { cwd });
		const firstKey = await lib.changeKey(cwd);
		const untracked = await lib.view(cwd, "/", []);
		assert.match(untracked.diff, /new file mode/);
		assert.deepEqual(Array.from(untracked.files), ["new.txt"]);
		const firstSignature = untracked.signatures["new.txt"];
		execFileSync("node", ["-e", "require('node:fs').appendFileSync('new.txt', 'changed\\n')"], { cwd });
		assert.notEqual(await lib.changeKey(cwd), firstKey);
		assert.notEqual((await lib.view(cwd, "/", [])).signatures["new.txt"], firstSignature);
		execFileSync("node", ["-e", "require('node:fs').writeFileSync('.gitignore', 'ignored/\\n'); require('node:fs').mkdirSync('ignored'); require('node:fs').writeFileSync('ignored/cache.txt', 'skip\\n')"], { cwd });
		const ignored = await lib.ignoredRoots(cwd);
		assert.deepEqual(Array.from(ignored), [join(cwd, "ignored")]);
		const ignoredKey = await lib.changeKey(cwd);
		execFileSync("node", ["-e", "require('node:fs').appendFileSync('ignored/cache.txt', 'still skipped\\n')"], { cwd });
		assert.equal(await lib.changeKey(cwd), ignoredKey);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}

	{
		const root = mkdtempSync(join(tmpdir(), "pi-diff-worktree-test-"));
		const repo = join(root, "repo");
		const worktree = join(root, "wt");
		try {
			execFileSync("git", ["init", "-q", repo]);
			execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
			execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
			execFileSync("node", ["-e", "require('node:fs').writeFileSync('tracked.txt', 'hello\\n')"], { cwd: repo });
			execFileSync("git", ["add", "tracked.txt"], { cwd: repo });
			execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo });
			execFileSync("git", ["worktree", "add", "-q", "-b", "worktree-test", worktree], { cwd: repo });

			const rawGitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: worktree }).toString().trim();
			const expectedGitDir = rawGitDir.startsWith("/") ? rawGitDir : resolve(worktree, rawGitDir);
			assert.equal(await lib.gitDir(worktree), expectedGitDir);
			assert.equal((await lib.repoInfo(worktree)).branch, "worktree-test");

			execFileSync("node", ["-e", "const fs = require('node:fs'); fs.appendFileSync('tracked.txt', 'changed\\n'); fs.writeFileSync('new.txt', 'new\\n')"], { cwd: worktree });
			const data = await lib.view(worktree, "/", []);
			assert.deepEqual(Array.from(data.files), ["tracked.txt", "new.txt"]);
			assert.match(data.diff, /diff --git a\/tracked\.txt b\/tracked\.txt/);
			assert.match(data.diff, /new file mode/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
})();
