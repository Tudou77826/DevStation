/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make lifecycle and initialization order implicit.',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: 'renderer-is-browser-only',
      severity: 'error',
      comment:
        'Renderer code must reach native capabilities only through the preload bridge.',
      from: { path: '^src/renderer/' },
      to: { path: '^(src/(main|preload)/|electron$|node:)' }
    },
    {
      name: 'preload-is-a-one-way-bridge',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/(main|renderer)/' }
    },
    {
      name: 'shared-is-platform-neutral',
      severity: 'error',
      comment:
        'Shared contracts must stay usable by both processes without platform side effects.',
      from: { path: '^src/shared/' },
      to: { path: '^(src/(main|preload|renderer)/|electron$|node:|react$)' }
    },
    {
      name: 'main-does-not-import-ui',
      severity: 'error',
      from: { path: '^src/main/' },
      to: { path: '^src/(renderer|preload)/' }
    },
    {
      name: 'production-does-not-import-tests',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.(ts|tsx)$' },
      to: { path: '\\.(test|spec)\\.(ts|tsx)$' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.web.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' }
    }
  }
}
