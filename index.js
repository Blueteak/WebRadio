const express = require('express');
const path = require('path');
const { getMp3Info, startStreaming } = require('./audio');

const app = express();
const port = 3000;
const filePath = path.join(__dirname, 'test.mp3');

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(err.status).end();
        }
    });
});

let clients = [];
let speed = 128; // Default speed in bytes per millisecond

// Function to handle new client connections
function handleNewClient(res) {
    console.log('New client connected');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    //res.setHeader('Connection', 'keep-alive');

    // Check if the client is already in the list
    if (!clients.includes(res)) {
        clients.push(res);
        // Send an initial small chunk of data to keep the connection alive
        res.write(Buffer.from([0x00]));
    }
}

// Get MP3 info and start the server
getMp3Info(filePath).then((info) => {
    speed = info.speed; // Update speed with the calculated value
    console.log(`MP3 duration: ${info.duration}s, File size: ${info.fileSize} bytes, Speed: ${speed.toFixed(2)} bytes/ms`);

    app.get('/stream', (req, res) => {
        handleNewClient(res);

        req.on('close', () => {
            console.log('Client disconnected');
            clients = clients.filter((client) => client !== res);
        });
    });

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
        startStreaming(filePath, clients, speed);
    });
}).catch((err) => {
    console.error('Error getting MP3 info:', err.message);
});
