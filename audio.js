const path = require('path');
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const getMp3Info = (filePath) => {
    return new Promise((resolve, reject) => {
        mp3Duration(filePath, (err, duration) => {
            if (err) {
                return reject(err);
            }

            const fileSize = fs.statSync(filePath).size; // Get file size in bytes
            const speed = fileSize / (duration * 1000); // Calculate speed in bytes per millisecond

            resolve({
                duration,
                fileSize,
                speed,
            });
        });
    });
};

const startStreaming = (filePath, clients, speed, buffer) => {
    const command = ffmpeg(filePath)
        .format('mp3')
        .audioCodec('libmp3lame')
        .on('start', () => {
            console.log('Stream started');
        })
        .on('error', (err) => {
            console.error('An error occurred: ' + err.message);
        });

    const stream = command.pipe();

    const throttleStream = (chunk, speed) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                buffer.push(chunk);
                if (buffer.length > 10) buffer.shift(); // Keep the last 100 chunks

                clients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        client.send(chunk);
                    }
                });
                resolve();
            }, chunk.length / speed); // Adjust the delay based on chunk size and speed
        });
    };

    (async () => {
        try {
            for await (const chunk of stream) {
                await throttleStream(chunk, speed);
            }
        } catch (err) {
            console.error('Error in streaming:', err);
        }
    })();

    return stream;
};

module.exports = {
    getMp3Info,
    startStreaming,
};
