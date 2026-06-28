# @geminixiang/pi-diff

Pi extension that registers `/diff` and opens a browser diff dashboard using [diff2html](https://github.com/rtfpessoa/diff2html).

![pi-diff demo](https://raw.githubusercontent.com/geminixiang/pi-diff/main/assets/pi-diff-demo.png)

## Install

```bash
pi install npm:@geminixiang/pi-diff
```

For local development:

```bash
pi install ./path/to/pi-diff
```

## Use

```text
/diff
```

The page shows working tree diff, staged diff, and recent commit diffs. Optional args are passed to the working tree `git diff`, for example:

```text
/diff --cached
/diff HEAD~1
```

The extension starts a local `127.0.0.1` server for the session and closes it on Pi shutdown/reload.

## Development checks

```bash
npm test
npm run perf
```

`npm run perf` creates a temporary Git repo and fails if watcher events are not coalesced or `.gitignore`d writes trigger Git checks.
