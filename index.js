const express = require('express');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 3000;
const filePath = path.join(__dirname, 'test.mp3');

let clients = [];

// Function to handle new client connections
function handleNewClient(res) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    clients.push(res);
}

// Function to stream audio to clients
function startStreaming() {
    const command = ffmpeg(filePath)
        .format('mp3')
        .audioCodec('libmp3lame')
        .on('error', (err) => {
            console.error('An error occurred: ' + err.message);
        });

    const stream = command.pipe();

    stream.on('data', (chunk) => {
        clients.forEach((client) => {
            if (!client.writableEnded) {
                client.write(chunk);
            } else {
                clients = clients.filter((c) => c !== client);
            }
        });
    });

    stream.on('end', () => {
        console.log('Restarting stream');
        startStreaming();
    });
}

app.get('/stream', (req, res) => {
    handleNewClient(res);

    req.on('close', () => {
        console.log('Client disconnected');
        clients = clients.filter((client) => client !== res);
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    startStreaming();
});
