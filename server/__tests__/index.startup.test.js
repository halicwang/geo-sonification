// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const express = require('express');
const { WebSocketServer } = require('ws');
const { startHttpServer, attachWsServer } = require('../index');

function closeHttpServer(server) {
    return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
}

function closeWsServer(wss) {
    return new Promise((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
    });
}

describe('index startup helpers', () => {
    test('startHttpServer resolves after successful bind', async () => {
        const app = express();
        const server = await startHttpServer(app, 0);
        try {
            const address = server.address();
            expect(address).toBeTruthy();
            expect(typeof address.port).toBe('number');
            expect(address.port).toBeGreaterThan(0);
        } finally {
            await closeHttpServer(server);
        }
    });

    test('startHttpServer rejects when port is already in use', async () => {
        const appA = express();
        const appB = express();
        const serverA = await startHttpServer(appA, 0);
        const busyPort = serverA.address().port;

        try {
            await expect(startHttpServer(appB, busyPort)).rejects.toMatchObject({
                code: 'EADDRINUSE',
            });
        } finally {
            await closeHttpServer(serverA);
        }
    });

    test('attachWsServer attaches to the HTTP server (shared single port)', async () => {
        const app = express();
        const server = await startHttpServer(app, 0);
        try {
            const wss = attachWsServer(server);
            try {
                expect(wss).toBeInstanceOf(WebSocketServer);
                // A server-mode WebSocketServer has no address() of its own; it
                // rides the HTTP server's listener. Confirm the HTTP listener
                // is still bound on the port we expect to share.
                expect(server.address().port).toBeGreaterThan(0);
            } finally {
                await closeWsServer(wss);
            }
        } finally {
            await closeHttpServer(server);
        }
    });
});
