# Übersicht Widgets (Vibe-Coded Edition)

Yes.

This entire repository is shamefully vibe coded.

There was no grand architecture.
No design document.
No roadmap.
No RFC.
No tests.

I just needed some quick widgets on my desktop and decided this repo was the easiest place to dump them.

---

## What This Repo Is

A collection of small, self-contained **Übersicht** widgets.

Each widget:

- Is a single `.jsx` file
- Runs a shell `command`
- Parses stdout (usually JSON)
- Renders something useful on the desktop
- Has all styling embedded
- Has zero external dependencies

No bundlers.
No npm install.
No build step.
Just vibes and `console.log(JSON.stringify(...))`.

---

## What This Repo Is Not

- Not a polished product
- Not a React app
- Not production-grade software
- Not architecturally elegant
- Not meant to impress anyone

This is pure “I needed this right now” energy.

---

## Design Philosophy

1. Keep everything self-contained.
2. Avoid dependencies.
3. Fail loudly but visibly.
4. Make it work.
5. Don’t overthink it.

If something looks like it was written at 1am:
It probably was.

---

## Maintenance Policy

Will things change?
Yes.

Will widgets be renamed?
Yes.

Will things break?
Almost certainly.

Is that fine?
Absolutely.

---

## Disclaimer

If you're looking for:

- Clean abstractions
- Formal testing
- Strict patterns
- Code review discipline

You will not find it here.

You will find:
Working desktop widgets built quickly and unapologetically.

---

Minimalism.
Speed.
Vibes.

That’s it.
