System: atlassian

# code-learn desktop design system

The skeleton (type scale, spacing, controls, breakpoints) is Atlassian's, from `@atlaskit/tokens` 20.6.1. The
look is the Seed packet direction. Every value lives in `desktop/src/renderer/styles/tokens.css`; page files use
the tokens, and `styles/design.test.ts` fails on a raw size or colour anywhere else. Mockups: `.design-mockups/`.

## Type

Faces: Schibsted Grotesk (`--display`) for headings, Atkinson Hyperlegible Next (`--sans`) for body and controls,
JetBrains Mono (`--mono`) for code, output and measurements only. All bundled woff2.

| Token | Value | Use |
|---|---|---|
| `--type-heading-xxlarge` | 700 32px/36px display | welcome hero |
| `--type-heading-xlarge` | 700 28px/32px display | screen title |
| `--type-heading-large` | 700 24px/28px display | exercise or lesson title |
| `--type-heading-medium` | 700 20px/24px display | section title, current topic |
| `--type-heading-small` | 700 16px/20px display | card title, topic name |
| `--type-heading-xsmall` | 700 14px/20px display | small heading |
| `--type-heading-xxsmall` | 700 12px/16px display | group label in the sidebar |
| `--type-body-large` | 400 16px/24px sans | lesson and task prose |
| `--type-body` | 400 14px/20px sans | default, inputs, buttons |
| `--type-body-small` | 400 12px/16px sans | metadata, helper text |
| `--type-code` | 400 14px/24px mono | editor, code blocks |
| `--type-code-small` | 400 12px/16px mono | file tabs, diffs, terminal |

Weights 400, 500, 600, 700 (Atlassian's 653 needs a variable face; the bundled faces stop at 700). Headings
track at -0.02em. Body measure at most 72ch.

## Space

`--space-025` 2px, `050` 4, `075` 6, `100` 8, `150` 12, `200` 16, `250` 20, `300` 24, `400` 32, `500` 40,
`600` 48, `800` 64, `1000` 80. 0 to 8px inside a component, 12 to 24px between components, 32 to 80px for page
layout. Page margin 32px from 1024px wide, 16px below. Gutter 16px, 12px below 1024px.

## Controls

Button 32px high (`--control-h`), 24px compact (`--control-h-compact`), 12px side padding. Text field 38px
(`--input-h`): 1px border, 8px block padding, 20px line. Border 1px (`--border`), 2px selected or emphasis
(`--border-bold`). Focus: 2px solid `--focus`, 2px offset. Radius `--radius-ctl` 2px on controls,
`--radius-card` 4px on panels, `--radius-tag` 2px on labels, `--radius-round` for dots and avatars only.
Inputs are as wide as their longest expected answer; full width only in a narrow column.

Rules for every screen:
- One primary action per screen, always on screen: marigold (`--primary`) with dark green text (`--on-primary`).
  Labels are verbs in sentence case.
- Destructive actions use the danger button and a confirmation step.
- Status colour lives on tags, icons and swatches, never on body text. A course carries a filled block of its colour.
- Desktop screens fill the window with a fixed gutter; no centred narrow column except reading text at 72ch.

## Colour

Strategy: committed. Garden green owns whole regions (the sidebar, the rail, the exercise's statement column);
marigold marks the one thing to do now (the primary button, the current step); everything else is sage-grey paper.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--garden` | #163A2C | #0C1C14 | sidebar, rail, title bar |
| `--garden-2` | #245640 | #1B3A2A | selected and hover on garden |
| `--packet` | #1E4D3B | #133325 | the statement column's field |
| `--garden-text` | #D6E5DA | #D6E5DA | text on garden |
| `--ground` | #ECF0E8 | #111A14 | window ground |
| `--card` | #F9FAF7 | #18231C | panels, editor |
| `--ink` | #17261D | #E4ECE2 | text |
| `--muted` | #3E5246 | #B4C4B8 | secondary text |
| `--faint` | #55675C | #8DA193 | metadata, placeholder |
| `--line` | #D2DBCD | #2A3A30 | dividers |
| `--primary` | #F2B33D | #F2B33D | primary button, current marker |
| `--ok` | #2B6E45 | #8FD19A | passed, done |
| `--bad` | #A8401F | #F09A78 | failed |
| `--blue` | #1F5C8C | #8CC3EE | links, information |

Full list with soft and line variants in `tokens.css`. Text is at least 4.5:1 on the surface it sits on.

## Imagery and motion

Progress is drawn from the logo: a seed (not started), a shoot (current), a sprout (done). Small labels on the
garden field are cut like plant stakes. No emoji or Unicode glyphs as icons. Motion: results rise from their top
edge (clip-path, 320ms, `--ease` = cubic-bezier(.16,1,.3,1)); a sprout unfolds once when a step is done; Sprig's
job fill as today. All motion stops under prefers-reduced-motion.

## Layout of the exercise screen

Rail (`--rail-w` 56px, garden) | statement (`--column-w` 320px, packet field: title, stake label, task, the
topic's steps, Previous and Next) | editor (rest: file tabs and Solution, Try it, Check in a 48px bar; code; results
under the code) | tutor (`--tutor-w` 304px, ground). Below 1440px the side columns narrow; below 1024px they stack.

## Layout of the Learn screen

Sidebar (`--sidebar-w` 240px, garden: navigation, your courses, jobs, theme) | the course path (topics as rows on a
2px ink rule, each with its seed, shoot or sprout; the current topic open to its lessons and exercises) | a 288px
side column (next up with Continue, rebuild, usage).

## Gates

`styles/design.test.ts`, on every stylesheet but `tokens.css` and `fonts.css`: no `px` outside `:root` blocks and
`@media` preludes; breakpoints only 320, 480, 768, 1024, 1440, 1768 wide, and 560 high (kept so the short-window
rules still switch on at 200% zoom on a 1080p screen); no hex, `rgb()` or `hsl()` colour; font weights 400 to 700.
Not gated: colours drawn in code (the terminal palette, the mermaid palette, Sprig's art), which set their own
values from these tokens by hand.

## Not yet followed

- The exercise statement doesn't list the topic's lessons and exercises with their growth stages (the mockup's
  "This topic" strip): Practice has no such list yet, so it needs new markup and data, not a restyle.
- On the Learn screen, Continue stays on the current topic's card rather than in the side column; the side column
  holds Mastery, Activities and Usage.
- Copy has not had its pass (docs/copy.md): wording is unchanged.
