# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Commit Message Style

Commit messages follow the owner's personal narrative style — the same one used across the ProblemSolver and MentorTable repos. Every message opens with **`Today I ...`** and is written in first person.

- **Subject line:** begins with `Today I ...`, says what was done in one flowing sentence, and reads as a complete sentence (a trailing period is fine).
- **Length varies naturally with the change.** A small fix can be a compact single sentence; a larger change deserves the detail it needs. Do not pad small commits to match big ones, and do not trim big commits down to one line — histories where every message is the same length read as machine-generated.
- **Body:** optional. For substantial changes, after a blank line, add paragraphs with the context, the reason, and the trade-offs; where something went wrong or is worth flagging, close with an `Honest note:`.
- **No conventional-commit prefixes** (`feat:` / `fix:` / `chore:`), no emoji in the subject.

Examples:

```
Today I fixed the check-in page spinning forever, because the session user hook was resolving through a network call that hung on slow connections, and switched it to the local session read with a timeout on the fetch.
```

```
Today I added the desktop sidebar shell above the 900px breakpoint.

The bottom tab bar now hides on wide screens and a 220px navigation rail takes over with the brand mark, active-route highlighting, the user card, and a sign-out action, all reading from the shared theme tokens.

Honest note: the first pass left the collapse button under the content column's hit area, and the browser test caught it before I did.
```

This file is tracked, so convention/documentation updates land as normal commits with the same `Today I ...` message.

