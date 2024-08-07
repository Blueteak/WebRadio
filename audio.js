const path = require('path');
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

//const filePath = path.join(__dirname, 'test_short.mp3');
//const filePath2 = path.join(__dirname, 'avenza.mp3');

const filePaths = [
    { path: path.join(__dirname, 'test_short.mp3'), name: 'Test Short' },
    { path: path.join(__dirname, 'avenza.mp3'), name: 'Avenza' },
    // Add more file paths as needed
];

ffmpeg.setFfmpegPath(ffmpegPath);

let stream = null;

const initialize = (clients, buffer, updateMetadata) => {
    const file = getRandomFilePath();
    getMp3Info(file.path).then((info) => {
        const speed = info.speed;
        console.log(`MP3 duration: ${info.duration}s, File size: ${info.fileSize} bytes, Speed: ${speed.toFixed(2)} bytes/ms`);
        stream = startStreaming(filePaths, clients, speed, buffer, updateMetadata, file.name, info.duration);
    }).catch((err) => {
        console.error('Error getting MP3 info:', err.message);
    });
}


const startStreaming = (filePaths, clients, speed, buffer, updateMetadata, songName, mp3Duration) => {
    const fadeDuration = 5; // duration of fade in seconds

    const throttleStream = (chunk, speed) => {
        return new Promise((resolve) => {
            const chunkSize = chunk.length;
            const delay = chunkSize / speed; // Delay in milliseconds

            setTimeout(() => {
                buffer.push(chunk);
                if (buffer.length > 10) buffer.shift(); // Keep the last 10 chunks

                clients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        client.send(chunk);
                    }
                });
                resolve();
            }, delay);
        });
    };

    (async () => {
        try {
            while (true) {
                const file = getRandomFilePath();
                const { stream, info } = await streamFileWithFade(file.path, fadeDuration);
                const startTime = Date.now();
                console.log(`Started streaming ${file.name} at ${new Date(startTime).toISOString()}`);

                updateMetadata({ type: 'metadata', name: file.name });

                let totalBytesStreamed = 0;
                let chunkCounter = 0;

                for await (const chunk of stream) {
                    const chunkStartTime = Date.now();
                    await throttleStream(chunk, info.speed);
                    totalBytesStreamed += chunk.length;
                    const chunkEndTime = Date.now();
                    console.log(`Chunk ${++chunkCounter}: size=${chunk.length} bytes, delay=${chunkEndTime - chunkStartTime}ms`);

                    if (chunkCounter === 1) {
                        console.log(`Fading In ${file.path}`);
                    }
                }

                console.log(`Fading out ${file.path}`);

                const endTime = Date.now();
                const streamedDuration = totalBytesStreamed / speed; // in milliseconds
                console.log(`Finished streaming ${file.name} at ${new Date(endTime).toISOString()}`);
                console.log(`Streamed duration (calculated): ${streamedDuration.toFixed(3)}ms, MP3 duration: ${(mp3Duration * 1000).toFixed(3)}ms`);
                console.log(`Actual streamed duration: ${(endTime - startTime)}ms`);

                // Check if the streamed duration matches the expected duration
                if (Math.abs(streamedDuration - mp3Duration * 1000) > 100) { // Allowing a tolerance of 100ms
                    console.warn(`Discrepancy detected: Streamed duration (${streamedDuration.toFixed(3)}ms) does not match MP3 duration (${(mp3Duration * 1000).toFixed(3)}ms)`);
                }
            }
        } catch (err) {
            console.error('Error in streaming:', err);
        }
    })();

    return stream;
};

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
    let availablePaths = filePaths.filter(file => file.path !== excludeFilePath);
    return availablePaths[Math.floor(Math.random() * availablePaths.length)];
};

module.exports = {
    initialize,
    startStreaming,
};