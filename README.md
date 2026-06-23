# pi-diff

Pi extension that registers `/pi-diff` and opens a browser diff dashboard using [diff2html](https://github.com/rtfpessoa/diff2html).

## Install

```bash
pi install ./path/to/pi-diff
```

Or try it once:

```bash
pi -e ./path/to/pi-diff
```

## Use

```text
/pi-diff
```

The page shows working tree diff, staged diff, and recent commit diffs. Optional args are passed to the working tree `git diff`, for example:

```text
/pi-diff --cached
/pi-diff HEAD~1
```

The extension starts a local `127.0.0.1` server for the session and closes it on Pi shutdown/reload.
