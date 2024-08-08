const path = require('path');
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const filePaths = [
    { path: path.join(__dirname, 'Dance_Party.mp3'), name: 'Dance Party' },
    { path: path.join(__dirname, '30S_Timer.mp3'), name: '30 Second Timer' },
    { path: path.join(__dirname, 'Short_Song.mp3'), name: 'Short Song' },
    { path: path.join(__dirname, 'test_short.mp3'), name: 'Test Short' },
    // Add more file paths as needed
];

ffmpeg.setFfmpegPath(ffmpegPath);

let stream = null;

const initialize = (clients, buffer, updateMetadata) => {
    startStreaming(clients, buffer, updateMetadata);
}

const startStreaming = (clients, buffer, updateMetadata) => {
    (async () => {
        try {
            let preloadBuffer1 = [];
            let preloadBuffer2 = [];
            let currentBuffer = preloadBuffer1;
            let nextBuffer = preloadBuffer2;

            let tempFilePath1 = path.join(os.tmpdir(), `${uuidv4()}.mp3`);
            let tempFilePath2 = path.join(os.tmpdir(), `${uuidv4()}.mp3`);
            let currentTempFilePath = tempFilePath1;
            let nextTempFilePath = tempFilePath2;

            // Pre-load the first song
            let file = getRandomFilePath();
            console.log(`Loading first song: ${file.name}`);
            let info = await getMp3Info(file.path);
            let currentSong = await loadAndPrepareFile(file.path, info.duration);
            currentTempFilePath = currentSong.path;
            let currentSpeed = currentSong.speed;



            while (true) {
                // Stream the current song
                const fadeDuration = 5; // duration of fade in seconds
                const chunks = await streamFileWithFade(currentTempFilePath, fadeDuration, info);


                updateMetadata({ type: 'metadata', name: file.name });

                let totalBytesStreamed = 0;

                // Pre-load the next song while streaming the current one
                file = getRandomFilePath();
                console.log(`Preloading next song: ${file.name}`);
                let nextSongSpeed = 0;
                getMp3Info(file.path).then(info => {
                    loadAndPrepareFile(file.path, info.duration).then(nextSong => {
                        nextTempFilePath = nextSong.path;
                        nextBuffer.length = 0; // Clear the next buffer
                        nextBuffer = currentBuffer.concat(nextBuffer);
                        nextSongSpeed = nextSong.speed;
                    });
                });

                const startTime = Date.now();
                console.log(`Started streaming ${file.name} at ${new Date(startTime).toISOString()} with size ${info.fileSize} bytes`);

                for (const chunk of chunks) {
                    await throttleStream(chunk, currentSpeed, buffer, clients);
                    totalBytesStreamed += chunk.length;
                }

                console.log(`Finished streaming ${file.name} (${totalBytesStreamed} bytes) in ${(Date.now() - startTime)}ms`);

                // Swap buffers and temp file paths
                [currentTempFilePath, nextTempFilePath] = [nextTempFilePath, currentTempFilePath];
                [currentSpeed, nextSongSpeed] = [nextSongSpeed, currentSpeed];
            }
        } catch (err) {
            console.error('Error in streaming:', err);
        }
    })();
};

const loadAndPrepareFile = async (filePath, duration) => {
    let preloadBuffer = [];
    await loadFileWithFFmpeg(filePath, preloadBuffer);
    console.log(`Preload buffer size: ${preloadBuffer.reduce((acc, chunk) => acc + chunk.length, 0)} bytes`);
    const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}.mp3`);
    fs.writeFileSync(tempFilePath, Buffer.concat(preloadBuffer));
    const currentSongSpeed = preloadBuffer.reduce((acc, chunk) => acc + chunk.length, 0) / (duration * 1000); // Calculate speed in bytes per millisecond
    return { path: tempFilePath, speed: currentSongSpeed };
};

const streamFileWithFade = (filePath, fadeDuration, info) => {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(filePath)
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioFilters(`afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${info.duration - fadeDuration}:d=${fadeDuration}`)
            .on('start', () => {
                console.log(`Reading Song Data`);
            })
            .on('end', () => {
                console.log('Finished reading Song Data');
            })
            .on('error', (err) => {
                console.error('An error occurred: ' + err.message);
                reject(err);
            });

        const stream = command.pipe();

        let totalChunkBytes = 0;
        const chunks = [];
        stream.on('data', (chunk) => {
            totalChunkBytes += chunk.length;
            chunks.push(chunk);
        });

        stream.on('end', () => {
            console.log(`Total chunk bytes read: ${totalChunkBytes}`);
            console.log('Pipe Stream Completed');
            resolve(aggregateChunks(chunks, 16384)); // Aggregate into 16KB chunks
        });

        stream.on('error', (err) => {
            console.error('Stream error: ' + err.message);
            reject(err);
        });
    });
};

const aggregateChunks = (chunks, targetSize) => {
    const aggregatedChunks = [];
    let buffer = Buffer.alloc(0);

    for (const chunk of chunks) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= targetSize) {
            aggregatedChunks.push(buffer.slice(0, targetSize));
            buffer = buffer.slice(targetSize);
        }
    }

    if (buffer.length > 0) {
        aggregatedChunks.push(buffer);
    }

    return aggregatedChunks;
};

const throttleStream = (chunk, speed, buffer, clients) => {
    return new Promise((resolve) => {
        const chunkSize = chunk.length;

        setTimeout(() => {
            buffer.push(chunk);
            console.log(`Streaming Chunk: ${chunkSize} bytes`);
            if (buffer.length > 10) buffer.shift(); // Keep the last 10 chunks

            clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    client.send(chunk);
                }
            });
            resolve();
        }, chunkSize / speed);
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

const loadFileWithFFmpeg = (filePath, preloadBuffer) => {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(filePath)
            .format('mp3')
            .audioCodec('libmp3lame');

        const stream = command.pipe();

        stream.on('data', (chunk) => {
            preloadBuffer.push(chunk);
        });

        stream.on('end', () => {
            console.log('Finished loading file with FFmpeg.');
            resolve();
        });

        stream.on('error', (err) => {
            console.error('Stream error: ' + err.message);
            reject(err);
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
