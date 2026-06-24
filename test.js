const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const vm = require("node:vm");

const lib = { require, module: { exports: {} }, process };
vm.runInNewContext(readFileSync("extensions/pi-diff.js", "utf8"), lib);

(async () => {
	assert.deepEqual(Array.from(lib.shlex(" --stat  README.md ")), ["--stat", "README.md"]);
	assert.throws(() => lib.shlex('--output="foo bar.patch"'), /not supported/);
	assert.throws(() => lib.shlex("foo\\ bar.txt"), /not supported/);

	assert.equal(lib.githubUrl("git@github.com:owner/repo.git"), "https://github.com/owner/repo");
	assert.equal(lib.githubUrl("https://github.com/owner/repo.git\n"), "https://github.com/owner/repo");
	assert.equal(lib.githubUrl("https://gitlab.com/owner/repo.git"), null);

	const html = lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: "</script>", files: ["a.js", "b.js"], commits: [], repo: { url: "https://github.com/owner/repo", branch: "feature/x" } });
	assert.match(html, /diff2html-ui\.js/);
	assert.match(html, /new Diff2HtmlUI/);
	assert.match(html, /compare\/feature%2Fx\?expand=1/);
	assert.match(html, /tree\/feature%2Fx/);
	assert.match(html, /class="logo" href="https:\/\/github\.com\/owner\/repo"/);

	const htmlNoRepo = lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: "", files: [], commits: [], repo: { url: null, branch: null } });
	assert.match(htmlNoRepo, /<span class="logo">pi-diff<\/span>/);
	assert.match(htmlNoRepo, /new EventSource\("\/events"\)/);
	assert.doesNotMatch(htmlNoRepo, /<a class="icon-link"/);
	const extracted = lib.extractFiles("diff --git a/old.txt b/new.txt\ndiff --git a/foo b/foo");
	assert.equal(extracted.length, 2);
	assert.equal(extracted[0], "new.txt");
	assert.equal(extracted[1], "foo");
	assert.equal(lib.extractFiles("not a diff").length, 0);

	assert.match(html, /line-by-line.*side-by-side/);
	assert.match(html, /view-mode/);
	assert.match(html, /data-path="a\.js"/);
	assert.doesNotMatch(html, /const chunks = diff\.split\(\/\n/);
	assert.match(html, /hash\(chunks\[files\.indexOf\(path\)\]/);
	assert.match(html, /viewed\[checkbox\.dataset\.path\] === signature/);
	assert.match(html, /localStorage\.setItem\(viewedKey/);
	assert.doesNotMatch(html, /diff-mobile|diff-desktop|d2h-file-side-diff/);

	const cwd = mkdtempSync(join(tmpdir(), "pi-diff-test-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		assert.deepEqual(Array.from(await lib.commits(cwd)), []);
		await assert.rejects(() => lib.view(cwd, "/nope", []), /Not found/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
})();
