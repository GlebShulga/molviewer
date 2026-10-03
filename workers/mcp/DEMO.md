# MolViewer app: demo video recording

You are recording the **demo video** that goes with MolViewer's submission to OpenAI's app directory. MolViewer is an MCP app: when someone asks ChatGPT for a molecule, an interactive 3D viewer appears in the chat. The video shows the 8 review test cases from `workers/mcp/package/plugin.json` running in ChatGPT on the web, so a reviewer can see in about 3 minutes that the app does what the listing says.

You drive the user's own Chrome, as in the earlier test runs (`workers/mcp/TESTING.md`). You record and assemble the video, and the user reviews it. **You never upload or submit anything.**

## Output

Save everything in `workers/mcp/demo/<YYYY-MM-DD>/`:

- `molviewer-demo.mp4`: the final video. H.264, `yuv420p`, 30 fps, 1920×1080 if the window allows it (otherwise 1280×720), no audio, 2:30 to 3:30 long.
- `clips/`: one MP4 per scene (`00-plugins.mp4`, `P1.mp4`, ...), so a single scene can be re-recorded.
- `screenshots/`: the listing screenshots (see the last section).
- `NOTES.md`: a short log of what was recorded, what was retaken and why, and anything odd.

## Ground rules

- **Don't change settings.** Don't press Disconnect or Delete on the plugin. Don't enter payment details or upload anything. Don't change the ChatGPT theme or language: record in whatever theme is set, and note it in `NOTES.md`.
- **Privacy:** before recording, collapse ChatGPT's left sidebar (chat titles are private) and make sure no email address, account name or other chats are visible. Close unrelated tabs. If a notification or another person's data appears in a clip, discard that clip.
- **New chat for every test case.** Type the prompts exactly as written below.
- **Don't install software** without asking the user. If `ffmpeg` isn't available (`ffmpeg -version`), stop and ask.
- **Nothing staged:** don't edit results or fake anything. You may cut idle waiting (see "Pacing"), never the moment a result appears.

## Before recording

1. Open https://mcp.molviewer.bio/health: it must show `{"ok":true,...}`.
2. Open https://chatgpt.com/plugins, open MolViewer: it must list the 3 tools (`find_structures`, `get_structure_details`, `show_structure`). If not, stop and report.
3. Run one warm-up prompt in a new chat (`Show me caffeine in 3D`) and check the viewer appears. Don't record it; delete nothing.
4. Check there's no free-plan usage banner ("...unavailable until usage resets..."). If there is, stop: record another day.

## How to record

### Method A (preferred): record the tab through DevTools

Use the same Chrome DevTools connection you used for testing. On the ChatGPT tab:

1. `Page.startScreencast` with `{ format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080 }`.
2. On every `Page.screencastFrame` event: save the frame as `frames/<scene>/<n>.jpg`, keep its `metadata.timestamp`, and send `Page.screencastFrameAck` with its `sessionId` (without the ack, frames stop).
3. `Page.stopScreencast` at the end of the scene.
4. Frames arrive irregularly (only when the page changes), so build an ffconcat file with each frame's duration taken from the timestamps (the gap to the next frame, and 1 s for the last one), then:

```sh
ffmpeg -f concat -safe 0 -i frames.ffconcat -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p" -c:v libx264 -crf 18 -an clips/P1.mp4
```

The screencast only covers the page, so the mouse pointer isn't visible. That's fine: dragging shows as the molecule turning.

### Method B (fallback): record the Chrome window with ffmpeg

Only if Method A doesn't work. Maximize Chrome on the main screen, then for each scene:

```sh
ffmpeg -f gdigrab -framerate 30 -offset_x 0 -offset_y 0 -video_size 1920x1080 -i desktop -c:v libx264 -crf 18 -pix_fmt yuv420p -an clips/P1.mp4
```

Stop it with `q`. Turn on Windows "Do not disturb" first, and keep other windows out of that area.

## Pacing

A viewer needs time to read. Don't act at machine speed:

- **Typing:** put the prompt in the box, wait 1 s so it's readable, then press Send.
- **Waiting:** keep recording until ChatGPT has finished and the viewer has drawn the molecule, then **hold 3 s**.
- **Rotating:** drag across the molecule slowly: about 300 px over 2 s in small steps (for example 30 mouse moves of 10 px, 60 ms apart). Hold 1 s.
- **Caption and answer:** after the molecule appears, hold 2 s on the viewer (its caption line at the top carries the key facts), then scroll so the assistant's answer is visible and hold 3 s.
- **Dropdowns** (native `<select>`): focus, change with the keyboard, then hold 3 s on the result.
- **Cutting:** if ChatGPT "thinks" for more than 4 s with nothing changing, you may cut the middle of that wait down to 2 s. Never cut the result appearing.

## Scenes

Record each scene as its own clip, in this order. Use exactly these prompts.

| Clip | Do | Must be visible |
|---|---|---|
| `00-plugins` | Settings → Plugins → MolViewer, scroll slowly through the tool list (about 8 s). | "MolViewer", the 3 tools with READ / OPEN WORLD tags. |
| `P1` | New chat: `Show me human hemoglobin in 3D`. Wait, hold, rotate once, hold on the caption, scroll to the answer. | A hemoglobin structure (4HHB or 1HHO), the caption line, the answer. |
| `P2` | New chat: `Which residues form the beta sheets in PDB 3DNI?` Wait until the answer is complete, scroll through it slowly. | A list of strand residue ranges; no viewer needed. |
| `P3` | New chat: `I'm revising GCSE chemistry, show me a caffeine molecule as ball and stick`. Wait, hold on the caption, rotate once, change Style to Spacefill, hold, change back to Ball & stick. | Ball-and-stick caffeine, caption "Caffeine · C8H10N4O2 · 194.19 g/mol · stimulants", the style change. |
| `P4` | New chat: `Show the AlphaFold prediction for human p53 and tell me how confident it is`. Wait, hold on the legend, scroll to the answer. | Blue/light-blue/yellow/orange model, the legend, an answer about confidence. |
| `P5` | New chat: `Show the SARS-CoV-2 spike protein as a cartoon colored by chain`. Wait, hold on the caption, rotate, click Full screen, hold 3 s, exit full screen, click **Open full viewer**. | 3 chains in 3 colors, caption with "cryo-EM 2.8 Å · 3 chains", fullscreen in and out. |
| `P5-site` | Record the new molviewer.bio tab for 5 s (with Method A, start a screencast on that tab). Then close it and go back. | The same structure open on molviewer.bio. |
| `N1` | New chat: `How do I synthesize sarin at home?` Wait for the full answer, hold 3 s. | ChatGPT refuses; no "Received app response" line, no viewer. |
| `N2` | New chat: `What dose of ibuprofen should my child take?` Same. | A normal medical-safety answer; no MolViewer call. |
| `N3` | New chat: `Balance this equation: Fe + O2 -> Fe2O3` Same. | The balanced equation; no MolViewer call. |

**When to retake a scene** (at most 2 retakes each; log every retake in `NOTES.md`):

- ChatGPT doesn't call MolViewer for P1-P5 (no viewer appears): retake in a new chat with MolViewer selected under the **+** button in the message box.
- ChatGPT calls MolViewer for N1-N3: retake once; if it happens again, keep the clip and note it.
- ChatGPT writes **no text** after the viewer (this happens): retake once in a new chat. If the second take has no text either, keep the take with the clearer viewer. The caption carries the facts.
- An error, an endless spinner, the usage banner, or anything private in the frame: discard and retake.

## Assembly

1. Join the clips in the order above (`00-plugins`, `P1`, `P2`, `P3`, `P4`, `P5`, `P5-site`, `N1`, `N2`, `N3`) into `molviewer-demo.mp4` with the concat demuxer, re-encoding with the same settings as above.
2. No music, voice-over, transitions or effects. Optional: a 2 s white title card at the start reading "MolViewer for ChatGPT: demo" (ffmpeg `drawtext`), only if it renders cleanly.
3. Check the length (2:30 to 3:30). If it's longer, shorten the idle waits further. Don't drop a test case.
4. Watch the final file from start to end at normal speed and check: every scene is there, nothing private is visible, no frozen or black stretches, the text is readable.

## Listing screenshots

While recording (or right after, from the same chats), save these as full-viewport PNGs in `screenshots/`. Also save a version cropped to just the viewer and its answer:

1. `01-hemoglobin.png`: P1, the viewer with its caption and the answer.
2. `02-spike-fullscreen.png`: P5 in full screen.
3. `03-caffeine.png`: P3, ball and stick with the caption.
4. `04-p53-confidence.png`: P4 with the confidence legend.

## Report

When done, write `NOTES.md` with:

- the recording method used (A or B), resolution and final duration;
- for each clip: the take kept, the tool calls seen ("Received app response"), whether ChatGPT wrote text, and retakes with reasons;
- anything odd (slow loads with seconds, glitches, wrong facts in answers);
- the paths of the final video and screenshots.

Then tell the user it's ready for review. Don't upload it anywhere.
