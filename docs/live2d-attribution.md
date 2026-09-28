# Live2D sources and attribution

This app embeds a real Cubism model, not a moving photograph. The renderer, Core runtime, and sample character have **separate licenses**. Haru is a Live2D Inc. sample character; the app does not claim ownership of its illustration or rig.

## Renderer

- `pixi-live2d-display` **0.4.0** by guansss: [GitHub repository](https://github.com/guansss/pixi-live2d-display), MIT.
- `pixi.js` **6.5.10**: [PixiJS repository](https://github.com/pixijs/pixijs), MIT.
- `@pixi/unsafe-eval` **6.5.10**, from PixiJS, provides static shader bindings compatible with the app's strict Content Security Policy; it does not enable JavaScript eval.
- Copies of all three MIT licenses are included in `public/live2d/` and survive desktop packaging; dependency packages also retain their licenses.

## Cubism Core

- `public/vendor/live2dcubismcore.min.js` was downloaded directly from [Live2D's official SDK server](https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js) on 2026-09-26.
- The binary reports **Live2D Cubism SDK Core 5.1.0**. It loads the included Cubism 3 Haru rig through the renderer's Cubism 4 framework.
- Copyright © Live2D Inc. The original copyright and license header is unchanged.
- This is redistributable proprietary runtime code, **not MIT-licensed code**. The applicable [Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html) is preserved in `public/live2d/Live2D-Proprietary-Software-License-Agreement.html`.

## Haru sample model

- Character/model: **Haru (receptionist version)**, © Live2D Inc.
- Original information: [Live2D sample collection](https://www.live2d.com/en/learn/sample/).
- Retrieved from the renderer's [Haru sample directory](https://github.com/guansss/pixi-live2d-display/tree/31317b37d5e22955a44d5b11f37f421e94a11269/test/assets/haru), commit `31317b37d5e22955a44d5b11f37f421e94a11269`.
- The upstream repository identifies the sample as redistributed under Live2D's [Free Material License Agreement](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html). Also see [Live2D Cubism Sample Data Terms of Use](https://www.live2d.com/eula/live2d-sample-model-terms_en.html). Local copies of both are included in `public/live2d/`.
- The model canvas is 2400 × 4500. The package includes the original `.moc3`, two textures, physics, pose, five authored motions, and eight expressions.
- The local `.model3.json` removes the unused, missing `DisplayInfo` reference and two sound references to a different sample character. This prevents missing asset requests and Japanese sample voice playback. Geometry, textures, motion curves, expressions, and physics are unchanged. Chinese voice lip sync is supplied by this app.

## Local operation

All rendering code, Core, textures, motions, physics, and expressions are packaged locally. The character does not use a CDN or fetch model files from GitHub at runtime. Network access was needed only to acquire these dependencies. License terms remain applicable to any future redistribution or publication.
