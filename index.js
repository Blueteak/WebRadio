const express = require('express');
const path = require('path');
const { getMp3Info, startStreaming } = require('./audio');
const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 3000;
const filePath = path.join(__dirname, 'test.mp3');

let clients = [];
let buffer = [];
let stream = null;

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

    // Send the current buffer to the new client
    buffer.forEach(chunk => {
        if (ws.readyState === ws.OPEN) {
            ws.send(chunk);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients = clients.filter(client => client !== ws);
    });
});

getMp3Info(filePath).then((info) => {
    const speed = info.speed;
    console.log(`MP3 duration: ${info.duration}s, File size: ${info.fileSize} bytes, Speed: ${speed.toFixed(2)} bytes/ms`);
    stream = startStreaming(filePath, clients, speed, buffer);
}).catch((err) => {
    console.error('Error getting MP3 info:', err.message);
});
