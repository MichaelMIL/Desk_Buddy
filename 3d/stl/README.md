# STLs

Ready‑to‑print exports of [`../round_bot.scad`](../round_bot.scad). Each
file is named after the `part` that makes it.

| Folder | What's in it |
|---|---|
| [`core/`](core/) | The five parts every buddy needs |
| [`bodies/`](bodies/) | One body per build |
| [`accessories/`](accessories/) | Bands, ear cups, plugs and pods |

Every file is in print orientation: load it as it is and let the slicer
put it on the bed. Only the bodies need supports. The older files are
binary STLs centred on the bed. The newer ones are text STLs straight from
the OpenSCAD command line, at model coordinates. Slicers treat both the
same. To export again after changing the model, see
[`../README.md`](../README.md#changing-the-model).
