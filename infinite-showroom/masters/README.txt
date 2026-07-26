MASTERS — the client's full-size originals. NOT bundled, NOT shipped.

  masters/field/  ->  src/images/field/  + src/images/field/mobile/
  masters/cards/  ->  src/images/cards/  + src/images/cards/mobile/

Run `npm run images` after adding/replacing anything here. Nothing in this folder
is read at runtime: main.js globs only src/images/**, so these 3840x3840 files never
reach the browser (they were 13.6 MB; the shipped sets are 767 KB desktop / 310 KB
mobile).

Any format ffmpeg can read works (webp/jpg/png/avif/tif). Filenames carry through
to the shipped sets, and their SORT ORDER decides which image lands on which field
lane / which card, so renaming reshuffles the scene.
