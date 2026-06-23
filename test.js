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

	const html = lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: "</script>", commits: [] });
	assert.match(html, /diff2html-ui\.js/);
	assert.match(html, /new Diff2HtmlUI/);
	assert.match(html, /line-by-line.*side-by-side/);
	assert.match(html, /\\u003c\/script>/);
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
