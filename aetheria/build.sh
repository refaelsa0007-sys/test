#!/bin/sh
# Concatenates src/ into the single-file page that gets published.
set -e
cd "$(dirname "$0")"
{ cat src/00_head.html; for f in src/10_core.js src/20_render.js src/30_entities.js src/40_story_data.js src/45_story.js src/50_main.js; do cat "$f"; echo; done; echo '</script>'; } > index.html
node tools/validate_dialogue.js
echo "built index.html ($(wc -c < index.html) bytes)"
