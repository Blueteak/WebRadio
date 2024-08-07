const path = require('path');
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

//const filePath = path.join(__dirname, 'test_short.mp3');
//const filePath2 = path.join(__dirname, 'avenza.mp3');

const filePaths = [
    path.join(__dirname, 'test_short.mp3'),
    path.join(__dirname, 'avenza.mp3'),
    // Add more file paths as needed
];

ffmpeg.setFfmpegPath(ffmpegPath);

let stream = null;

const initialize = (clients, buffer) => {
    const filePath = getRandomFilePath();
    getMp3Info(filePath).then((info) => {
        const speed = info.speed;
        console.log(`MP3 duration: ${info.duration}s, File size: ${info.fileSize} bytes, Speed: ${speed.toFixed(2)} bytes/ms`);
        stream = startStreaming(filePaths, clients, speed, buffer);
    }).catch((err) => {
        console.error('Error getting MP3 info:', err.message);
    });
}

const streamFileWithFade = (filePath, fadeDuration) => {
    return new Promise((resolve, reject) => {
        getMp3Info(filePath).then(info => {
            const command = ffmpeg(filePath)
                .format('mp3')
                .audioCodec('libmp3lame')
                .audioFilters(`afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${info.duration - fadeDuration}:d=${fadeDuration}`)
                .on('start', () => {
                    console.log(`Fading In ${filePath} with at ${info.speed.toFixed(2)} bytes/ms`);
                })
                .on('end', () => {
                    console.log(`Fading out ${filePath}`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error('An error occurred: ' + err.message);
                    reject(err);
                });

            const stream = command.pipe();
            resolve({ stream, info });
        }).catch(err => {
            console.error('Error getting MP3 info:', err);
            reject(err);
        });
    });
};

const startStreaming = (filePaths, clients, speed, buffer) => {
    const fadeDuration = 5; // duration of fade in seconds

    const throttleStream = (chunk, speed) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                buffer.push(chunk);
                if (buffer.length > 10) buffer.shift(); // Keep the last 10 chunks

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
            while (true) {
                const filePath = getRandomFilePath();
                const { stream, info } = await streamFileWithFade(filePath, fadeDuration);
                for await (const chunk of stream) {
                    await throttleStream(chunk, info.speed);
                }
            }
        } catch (err) {
            console.error('Error in streaming:', err);
        }
    })();

    return stream;
};

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

const getRandomFilePath = (excludeFilePath) => {
    let availablePaths = filePaths.filter(path => path !== excludeFilePath);
    return availablePaths[Math.floor(Math.random() * availablePaths.length)];
};

module.exports = {
    initialize,
    startStreaming,
};