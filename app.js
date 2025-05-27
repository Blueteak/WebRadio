// To Renew SSH Certificate run the following commands
// sudo certbot renew
// sudo certbot renew --dry-run

const express = require('express');
const path = require('path');
const { initialize, updateClientList } = require('./audio');
const Playlist = require('./playlist');
const WebSocket = require('ws');

const app = express();
const port = 3000;

let clients = [];
let buffer = [];

app.use(express.static('public'));
app.use('/public', express.static('public'));

app.get('/library-info', (req, res) => {
    res.json(Playlist.GetPlaylistInfo());
});

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error('Error serving index_player.html:', err);
            res.status(err.status).end();
        }
    });
});

app.get('/stats', (req, res) => {
    res.json({
        playListData: Playlist.GetPlaylistInfo(),
        currentListeners: clients.length
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
        ws.send(JSON.stringify({ type: 'metadata', name: currentSongMetadata.name, artist: currentSongMetadata.artist }));
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

console.log('Fetching playlist');
Playlist.FetchSongs(2).then(() => {
    console.log('Playlist fetched - Starting Audio Streaming');
    initialize(clients, buffer, updateCurrentSongMetadata);
});
