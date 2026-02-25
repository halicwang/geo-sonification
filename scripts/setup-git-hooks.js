#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// Set git hooks path
execSync('git config core.hooksPath .githooks', { cwd: rootDir, stdio: 'inherit' });

// On Unix, ensure hook files are executable (no-op on Windows)
if (process.platform !== 'win32') {
    const hooksDir = path.join(rootDir, '.githooks');
    if (fs.existsSync(hooksDir)) {
        for (const file of fs.readdirSync(hooksDir)) {
            fs.chmodSync(path.join(hooksDir, file), 0o755);
        }
    }
}

console.log('Git hooks enabled: core.hooksPath=.githooks');
console.log('pre-commit and commit-msg hooks are active.');
console.log('pre-commit auto-formats staged files with Prettier.');
console.log('Default mode: warn-only (does not block commits).');
console.log('To enforce trailer check, commit with DEVLOG_REVIEWED_ENFORCE=1.');
