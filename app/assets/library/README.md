The phone app's copy of the animation library: every app build fills this
folder (tool/sync_library.sh runs sim/test/library.sh --app when an animation
changed), with index.json and one .dbal per animation. The files are not
committed; without them the app works, but it cannot put deleted animations
back on the buddy.
