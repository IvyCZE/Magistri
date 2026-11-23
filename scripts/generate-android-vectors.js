import fs from 'fs';
import path from 'path';
import { adaptiveGlyphVector, statusGlyphVector, LOGO_BACKGROUND, LOGO_GLYPH } from './lib/logo.js';

// Writes the Android resources that capacitor-assets does not produce (and would overwrite):
// the adaptive icon with a themed (Material You) layer, and the status bar icon.
// Note: capacitor-assets also reformats AndroidManifest.xml (whitespace only); restore it with git.
const res = path.resolve(process.cwd(), 'android/app/src/main/res');
const write = (file, content) => {
  const target = path.join(res, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_logo"/>
    <!-- Android 13+ themed icons tint this layer with the wallpaper colours. -->
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

write('mipmap-anydpi-v26/ic_launcher.xml', adaptive);
write('mipmap-anydpi-v26/ic_launcher_round.xml', adaptive);
write('drawable/ic_launcher_logo.xml', adaptiveGlyphVector(LOGO_GLYPH));
write('drawable/ic_launcher_monochrome.xml', adaptiveGlyphVector('#FFFFFFFF', 72, true));
write('drawable/ic_stat_notify.xml', statusGlyphVector());
write(
  'values/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${LOGO_BACKGROUND}</color>\n</resources>\n`,
);

console.log('Android icon resources written to', res);
