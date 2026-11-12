# Assembly guide source

[`assembly_guide.html`](assembly_guide.html) is the RoundBot assembly
guide: every part, what to print for each of the 22 builds, printing,
wiring, the nine assembly steps, fit tuning, and how to make a theme. It
opens in any browser and takes its pictures from [`../images/`](../images/).

[`build_pdf.mjs`](build_pdf.mjs) prints it to
[`../RoundBot_v8_Assembly_Guide.pdf`](../RoundBot_v8_Assembly_Guide.pdf)
with headless Chrome: A4, a page header and "Page X of Y" in the footer.

```sh
node 3d/guide/build_pdf.mjs              # writes 3d/RoundBot_v8_Assembly_Guide.pdf
node 3d/guide/build_pdf.mjs out.pdf      # somewhere else
CHROME=/path/to/chrome node 3d/guide/build_pdf.mjs
```

It needs Node 22 or later (it uses the built‑in `fetch` and `WebSocket`) and
Google Chrome, by default from `/Applications/Google Chrome.app`.

When a part or a fit changes in `../round_bot.scad`, update the tables in
the HTML (Core parts, Themes, Printing, Fit tuning), render any new
pictures into `../images/`, run the script, and commit the PDF together
with the HTML.
