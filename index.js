const express = require('express');
const path = require('path');
const { initialize, updateClientList } = require('./audio');
const WebSocket = require('ws');

const app = express();
const port = 3000;

let clients = [];
let buffer = [];

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(err.status).end();
        }
    });
});

// WebSocket server setup
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.push(ws);
    updateClientList(clients);

    // Send the current buffer to the new client
    buffer.forEach(chunk => {
        if (ws.readyState === ws.OPEN) {
            ws.send(chunk);
        }
    });

    // Send current song metadata
    if (currentSongMetadata) {
        ws.send(JSON.stringify({ type: 'metadata', name: currentSongMetadata.name }));
    }

    ws.on('close', () => {
        console.log('Client disconnected');
        clients = clients.filter(client => client !== ws);
        updateClientList(clients);
    });
});

let currentSongMetadata = null;

const updateCurrentSongMetadata = (metadata) => {
    currentSongMetadata = metadata;
    clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(metadata));
        }
    });
}

initialize(clients, buffer, updateCurrentSongMetadata);
