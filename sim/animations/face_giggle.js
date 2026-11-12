/* Face: giggle - made with the animation editor (sim/editor.html).
 * Open it there to keep editing; the SPEC below is the source of truth. */
const SPEC = {
  "name": "Face: giggle",
  "fps": 30,
  "duration": 3000,
  "colors": {
    "bg": "#000000",
    "iris": "#2a6cff",
    "mouth": "#ff4f7a",
    "blush": "#ff8fa3"
  },
  tracks: {
    squint: [[0, 0], [300, 1, "pop"], [2400, 1], [2800, 0]],
    lookX: [[0, 0], [2800, 0], [2950, 4], [3000, 0]],
    mouthCurve: [[0, 0.6], [300, 1]],
    mouthOpen: [[0, 0], [300, 0.9, "pop"], [700, 0.45], [1000, 0.9], [1400, 0.45], [1700, 0.9], [2100, 0.45], [2400, 0.7], [2800, 0]],
    mouthWidth: [[0, 26], [300, 38], [2500, 38], [2850, 26]],
    blush: [[0, 0], [400, 0.9], [2400, 0.9], [2900, 0]],
    bob: [[0, 0], [300, 0.7], [2300, 0.7], [2700, 0]],
    sparkle: [[0, 0], [500, 1], [2200, 1], [2600, 0]],
  },
};

Sim.register(FaceRig.animation(SPEC));
