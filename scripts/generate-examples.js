// Regenerates examples/responses/* from the real server. Run after changing the engine, taxonomy or data.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runExamples, examplesDir } from './exampleRunner.js';

await mkdir(join(examplesDir, 'responses'), { recursive: true });
const out = await runExamples();
for (const [file, content] of Object.entries(out)) await writeFile(join(examplesDir, file), JSON.stringify(content, null, 2) + '\n');
console.log(`Wrote ${Object.keys(out).length} example responses to examples/responses/`);
