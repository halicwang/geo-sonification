const express = require('express');
const { startHttpServer, startWsServer } = require('../index');

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

    test('startWsServer resolves after successful bind', async () => {
        const wss = await startWsServer(0);
        try {
            const address = wss.address();
            expect(address).toBeTruthy();
            expect(typeof address.port).toBe('number');
            expect(address.port).toBeGreaterThan(0);
        } finally {
            await closeWsServer(wss);
        }
    });

    test('startWsServer rejects when port is already in use', async () => {
        const wssA = await startWsServer(0);
        const busyPort = wssA.address().port;
        try {
            await expect(startWsServer(busyPort)).rejects.toMatchObject({
                code: 'EADDRINUSE',
            });
        } finally {
            await closeWsServer(wssA);
        }
    });
});
