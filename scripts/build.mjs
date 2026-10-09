import { mkdir, cp, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'family.css', 'app.js']) await copyFile(file, 'dist/' + file);
await cp('assets', 'dist/assets', { recursive: true });
await cp('data', 'dist/data', { recursive: true });
await mkdir('dist/lib', { recursive: true });
await copyFile('lib/family.js', 'dist/lib/family.js');
