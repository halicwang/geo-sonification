#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'data', 'cache');

if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('Removed data/cache');
} else {
    console.log('data/cache does not exist, nothing to clean');
}
