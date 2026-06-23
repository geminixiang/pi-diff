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

	const html = lib.diffHtml(`diff --git a/a.txt b/a.txt
index 83db48f..f735c64 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
`);
	assert.match(html, /d2h-file-side-diff/);
	assert.doesNotMatch(html, /diff-mobile|diff-desktop/);
	assert.match(lib.page({ cwd: ".", currentPath: "/", title: "t", command: "git diff", diff: html, commits: [] }), /collapsed \.d2h-files-diff/);

	const cwd = mkdtempSync(join(tmpdir(), "pi-diff-test-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		assert.deepEqual(Array.from(await lib.commits(cwd)), []);
		await assert.rejects(() => lib.view(cwd, "/nope", []), /Not found/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
})();
