const { build } = require('esbuild');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const targets = [
  {
    entryPoint: path.join(projectRoot, 'engine', 'arcade-engine.ts'),
    outfile: path.join(projectRoot, 'engine', 'arcade-engine.js'),
  },
  {
    entryPoint: path.join(projectRoot, 'engine', 'skeleton', 'skeleton-engine.ts'),
    outfile: path.join(projectRoot, 'engine', 'skeleton', 'skeleton-engine.js'),
  },
];

Promise.all(targets.map(({ entryPoint, outfile }) => build({
  entryPoints: [entryPoint],
  bundle: true,
  minify: false,
  sourcemap: true,
  outfile,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  logLevel: 'info'
}))).catch(() => process.exit(1));
