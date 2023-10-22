# decent-scale-js

(currently all code resides in brnach `gh-pages`)

## Features
- connect to scale
- read weight & weight change from scale (all firmware versions)

## Known Issues
- limited browser compatibility (Chrome, Edge, Opera)
  - https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility
- device has to be "paired" on each connection; web bluetooth only allows skipping the pairing step with browser flags
  - https://docs.google.com/document/d/1RF4D-60cQJWR1LoQeLBxxigrxJwYS8nLOE0qWmBF1eo/edit#heading=h.twjxkn26byjx
  - https://bugs.chromium.org/p/chromium/issues/detail?id=577953
