# Scenes: what to make, and how it becomes part of the game

The world is a row of pixel-art scenes. Each scene is a wide panorama that your character walks along: every level
up moves them to the next **stop**, and when a scene's levels are used up the next scene takes over. Any scene
already reached can be picked again later.

This page is the spec for a new scene (what to send) and the checklist for turning it into one (what Claude
does). The first scene, the forest station, is the worked example throughout.

## What to send for a new scene

### 1. The panorama: three panels that continue into each other

Make **three panels of 1536 x 1024**, each continuing the one before it to the right, as if one long picture were
cut into three. They are stitched into one panorama of about **3000 x 1024** (overlaps are cut away), which the
game shows at its true pixel size of about **750 x 256**: the art's pixels are 4 image pixels wide.

**Make each scene a different place.** Only the pixel size, the camera and the walkway carry over from scene to
scene; the setting, palette, time of day and weather should change. Don't attach the station's panels as a style
example: generators copy attached images closely, so the result comes out as another rainy forest evening.

A prompt to start from (fill in the brackets; the harbour below is one worked example):

> Pixel-art game background, side view, part 1 of 3 of one long continuous panorama that reads left to right.
> 1536 x 1024. Chunky pixels, each art pixel exactly 4 x 4 image pixels, limited palette, crisp edges, no blur or
> gradients smoother than the pixel grid.
> Setting: [the place, time of day and weather, with its own colours]. [The sky and the far background], with
> the horizon about [40-50]% down the image.
> In this part: [two or three things to stand in front of, from left to right].
> A flat [walkway surface] runs along the whole bottom fifth of the image at the same height, its top surface at
> row 848 of 1024, continuing past both edges, with nothing standing on it. Below it only a low strip of
> [low wall, plants or rocks] at the very bottom.
> Warm yellow [lanterns, windows, lamps], clearly brighter than their surroundings. The scene continues past the
> right edge into the next part. No people, animals, birds, text, letters or logos.

For parts 2 and 3: "Part 2 of 3, continuing exactly from the right edge of the attached part 1: same pixel size,
palette, sky, horizon height and walkway row (top at row 848 of 1024), unbroken across the join. In this part:
[...]". Send the earlier part with it each time, so the edge matches. Part 3 says where the scene ends.

If part 1 comes out with pixels finer than 4 image pixels, try again with one station panel attached and the line
"Match only the pixel size and camera height of the attached image; use none of its colours, objects or
lighting."

**Worked example, a harbour boardwalk** (bright late morning, the opposite of the station's rainy dusk):

- Setting: a sunny Mediterranean fishing harbour, clear blue sky with a few white clouds, turquoise sea to a flat
  horizon about 45% down, a hazy island far away. Walkway: a sun-bleached wooden boardwalk, a stone pier in part 3.
- Part 1: the foot of a cobbled lane; a whitewashed café with blue shutters and a striped awning; a fish stall
  under a canvas awning with ice crates, ropes and hanging lanterns.
- Part 2: two small blue and yellow fishing boats at a low quay; a rusty anchor on a stone plinth; lobster pots
  and a signpost with a hanging board (no text) that could swing; string lights on poles along the back.
- Part 3: the harbour-master's hut with a round clock and a lit window; a red-and-white lighthouse at the far
  right end, its lamp room glowing, open sea beyond.
- Stops: café door, fish stall, anchor, hut, lighthouse. The signboard is the tap-to-move part. A night version
  is worth asking for here: a bright midday scene tinted dark looks flatter than one drawn at night.

Other directions that keep the world varied: a snowy mountain pass (a cable-car station, a wooden lodge, ski racks,
a frozen waterfall, pale blue sky); a desert canyon market (red sandstone cliffs, cloth-covered stalls, a well, a
palm oasis at golden hour).

**Rules that make a scene work in the game:**

- **The walkway.** The character walks along a flat strip near the bottom. On the station it is the wet
  platform, with the character's feet at about **83% of the way down** (row 848 of 1024). Keep it at the same
  height and unbroken across all three panels, with nothing standing on it.
- **Nothing in front of the walkway** except low things at the very bottom (the station's stone wall and plants).
  Anything tall in front would hide the character.
- **No people or animals.** The character is drawn by the game; fireflies and smoke are added in code.
- **Light sources stand out.** Warm, bright windows, lamps and lanterns are found automatically and glow and
  flicker at night. Keep them warm yellow-orange and clearly brighter than their surroundings.
- **Interesting things spread out.** There are up to 5 stops in a scene, spread across it (the station's are 115-185 art pixels apart). Give each stop
  something to stand in front of (the station's door, benches, the bell post, the tunnel).
- **Same pixel size and camera, different place.** Keep the 4-pixel art pixels, the side view, the horizon at
  about 40-50% down and the walkway row; these make scenes feel like one world. Change the setting, palette,
  lighting and weather, so each scene feels like a new place on the journey.

### 2. Optional extras (each makes the scene better)

| Extra | What it adds | How |
|---|---|---|
| Separate layers | Real depth when the scene tilts | The same three panels, split into transparent PNGs: sky, far hills, trees, buildings, walkway, front. Without them, Claude cuts layers with a depth model; that works for the sky and mountains only. |
| Moving parts | A tap makes them move (the station's bell swings) | Say which object should move. Claude cuts it out. A separate transparent image of it is even better. |
| Day and night versions | Real lighting instead of a colour tint | The same panels redrawn at night (and/or midday). Morning and day are tinted from the main version otherwise, which looks a little washed out. |
| Sounds | A tap plays a sound | Say what it should sound like; small sounds are made in code (the bell is). |

### 3. How many levels it lasts

A scene lasts **5 to 10 levels**, with up to one stop per level. 5 levels and 5 stops means one stop per level;
10 levels and 5 stops means a new stop every two levels. Say which you want; 5 is the default.

### 4. That it may be shipped

The app is public. Say where the art came from. If a generator made it, its terms apply (check them when you
make the art; OpenAI's currently give you the rights to what it makes).

## What Claude does with it

All scripts are in `art/`; the scene's working files are in `art/scenes/<id>/`. The bulky files (panorama,
depth, previews) are rebuilt by the scripts and not committed.

1. **Stitch:** `python art/stitch_panorama.py art/scenes/<id>/panorama.png <panel1> <panel2> <panel3>`. Check the
   seams (the station's: one wire ends in mid-air).
2. **Depth** (when there are no layers): Depth Anything V2 Small (Apache-2.0; never the Base or Large models, which
   are non-commercial), run on ComfyUI's Python:
   `<ComfyUI python> -s art/scene_depth.py art/scenes/<id>/panorama.png art/scenes/<id>/depth.png`.
3. **Layers and moving parts:** write `art/scenes/<id>/layers.json`, then run `python art/scene_layers.py
   art/scenes/<id>`. That writes `public/scenes/<id>/` (base, layers, sprites) at the true pixel size.
   - `ground` and `front`: panorama rows where the walkway starts and the front strip starts.
   - `depth`: three depth-band edges (forest, props, near).
   - `force`: `[x0, y0, x1, y1, layer]` boxes that pin areas to a layer.
   - `sprites`: moving parts, each with a `box` holding the part and some background, a `threshold`, and
     `exclude` boxes for scene bits touching it (the beam tip touching the bell).
4. **Manifest:** write `public/scenes/<id>/scene.json` (fields below), then add the id to
   `public/scenes/world.json` in the order the player meets the scenes.
5. **Check:** `npx vitest run src/scene/manifest.test.ts` validates every scene. Then open the scene lab
   (`npm run dev`, then `/fitness-quest/scene-lab.html`) and check, at phone width: each stop, a lean left and
   right (nothing doubles), every tap, dusk, night and rain.
6. **Budget:** about 300-600 KB per scene in WebP (the station is about 550 KB).

### `scene.json`

Coordinates are in the scene's own pixels (about 750 x 256), x from the left, y from the top. The contract and
its rules are in `src/scene/manifest.ts`.

| Field | Meaning | Station |
|---|---|---|
| `v`, `id`, `name` | Format version (1), folder name, name shown in the Scenes picker | `"station"`, `"Forest station"` |
| `width`, `height` | Size in scene pixels | 750 x 256 |
| `ground` | The row the character's feet stand on | 212 |
| `layers` | Back to front: `src` and `depth` (-1 far, which trails behind when the view tilts; 0 moves with the view) | 5 layers, the first at -1 |
| `stops` | x of each stop, left to right, inside the scene | 70, 215, 330, 455, 640 |
| `levels` | Levels the scene lasts, 5-10, at least as many as stops | 5 |
| `lights` | Rows holding the lamps and windows that glow | 110-186 |
| `smoke` | Chimney tops | one, at 68, 109 |
| `fireflies` | Area and number | 36 over the forest |
| `mist` | Drifting bands: row, height, speed, opacity | two |
| `puddles` | Rows of the wet surface (shimmer, rain ripples, reflections) | 196-220 |
| `taps` | Tap spots: `id`, spoken `label`, `kind` (`bell` or `lamp`), `box`; a bell also has its `pivot` and cut-out `sprite` | bell and three lamp groups |

The rules checked on top of the field types: the ground row is inside the scene, stops go left to right inside it,
5-10 levels with no more stops than levels, each layer file is listed once, bands and tap boxes are the right way
round and inside the scene, tap ids are unique, and a bell has its sprite (and only bells have one).

## Characters

Characters are separate from scenes: any character walks through any scene. They come from two sheets with
transparent backgrounds, laid out like the first three:

- **Walk sheet** (1536 x 1024): one row per character, 8 walk frames facing right in 192 px cells, a full step
  cycle.
- **Poses sheet** (1536 x 1024): one 512 px column per character. Row 1 is standing, facing the viewer. Row 2 is
  an emote (the first three cheer, look tired and huff), with any marks around it.

`python art/character_sheets.py` cuts them into `public/characters/<id>.webp`: one strip per character (8 walk
frames, standing, emote), 44 scene pixels tall, standing on the bottom row. It also writes
`public/characters/characters.json`. New characters go in the same layout, with their names and emote kinds added
to the list at the top of the script.
