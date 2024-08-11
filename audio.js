const axios = require('axios');
const path = require('path');
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const Playlist = require('./playlist');

ffmpeg.setFfmpegPath(ffmpegPath);

let stream = null;
let curClients = [];

const initialize = (clients, buffer, updateMetadata) => {
    curClients = clients;
    startStreaming( buffer, updateMetadata);
}

const updateClientList = (clients) => {
    curClients = clients;
}

const startStreaming = (buffer, updateMetadata) => {

    (async () => {
        try {
            const fadeDuration = 5; // duration of fade in seconds

            let preloadBuffer1 = [];
            let preloadBuffer2 = [];
            let currentBuffer = preloadBuffer1;
            let nextBuffer = preloadBuffer2;

            let tempFilePath1 = path.join(os.tmpdir(), `${uuidv4()}.mp3`);
            let tempFilePath2 = path.join(os.tmpdir(), `${uuidv4()}.mp3`);
            let currentTempFilePath = tempFilePath1;
            let nextTempFilePath = tempFilePath2;

            // Preload the first song
            let file = Playlist.GetRandomSong();
            console.log(`Downloading and loading first song: ${file.name}`);
            let tempFile = await downloadMp3FromUrl(file.url);
            let info = await getMp3Info(tempFile);
            info.name = file.name;
            let currentSong = await loadAndPrepareFile(tempFile, info.duration);
            currentTempFilePath = currentSong.path;
            let currentSpeed = currentSong.speed;

            let chunks = await streamFileWithFade(currentTempFilePath, fadeDuration, info);
            let nextChunks = [];
            let curDuration = info.duration;

            while (true) {

                updateMetadata({ type: 'metadata', name: file.name, artist: file.artist });
                let lastSong = file;

                let totalBytesStreamed = 0;
                let nextDur = 0;

                // Preload the next song while streaming the current one
                let nextSongSpeed = 20;

                file = Playlist.GetRandomSong();
                console.log(`Preloading next song: ${file.name}`);

                downloadMp3FromUrl(file.url).then(nextTempFilePath =>
                {
                    getMp3Info(nextTempFilePath).then(info =>
                    {
                        info.name = file.name;
                        loadAndPrepareFile(nextTempFilePath, info.duration).then(nextSong =>
                        {
                            nextBuffer.length = 0; // Clear the next buffer
                            nextBuffer = currentBuffer.concat(nextBuffer);
                            nextSongSpeed = nextSong.speed;
                            nextDur = info.duration;
                        }).then(() =>
                        {
                            streamFileWithFade(nextTempFilePath, fadeDuration, info).then(mp3Dat =>
                            {
                                nextChunks = mp3Dat;
                            });
                        });
                    });
                });

                const startTime = Date.now();
                console.log(`Started websocket streaming ${lastSong.name} at ${new Date(startTime).toISOString()} with size ${info.fileSize} bytes`);

                for (const chunk of chunks) {
                    await throttleStream(chunk, currentSpeed, buffer);
                    totalBytesStreamed += chunk.length;
                }

                console.log(`Finished websocket stream of ${lastSong.name} (${totalBytesStreamed} bytes) in ${(Date.now() - startTime)}ms -> Check ` + curDuration);
                console.log('--------------------------------------------------------------------------------');

                // Swap buffers and temp file paths
                [currentTempFilePath, nextTempFilePath] = [nextTempFilePath, currentTempFilePath];
                [currentSpeed, nextSongSpeed] = [nextSongSpeed, currentSpeed];
                chunks = nextChunks;
                curDuration = nextDur;
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
    return { path: tempFilePath, speed: currentSongSpeed * 1.02 };
};

const streamFileWithFade = (filePath, fadeDuration, info) => {
    return new Promise((resolve, reject) => {
        console.log('Starting FFMPEG stream of ' + info.name);
        const command = ffmpeg(filePath)
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioFilters(`afade=t=in:st=0:d=${fadeDuration},afade=t=out:st=${info.duration - fadeDuration}:d=${fadeDuration}`)
            .on('start', () => {
                console.log(`Reading Song Data of ${info.name}`);
            })
            .on('end', () => {
                console.log('Finished FFMPEG stream loading of ' + info.name);
            })
            .on('error', (err) => {
                console.error('FFMPeg Load error occurred: ' + err.message);
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
            console.log(`Total chunk bytes read: ${totalChunkBytes} for ${info.name}`);
            resolve(aggregateChunks(chunks, 16384)); // Aggregate into 16KB chunks
        });

        stream.on('error', (err) => {
            console.error('FFMPeg Pipe Stream error: ' + err.message);
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

let clientWait = false;

const throttleStream = (chunk, speed, buffer) => {
    return new Promise((resolve) => {
        const chunkSize = chunk.length;

        const streamChunk = () => {
            setTimeout(() => {
                buffer.push(chunk);
                //console.log(`Streaming Chunk: ${chunkSize} bytes`);
                if (buffer.length > 10) buffer.shift(); // Keep the last 10 chunks

                curClients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        client.send(chunk);
                    }
                });

                resolve();
            }, chunkSize / speed);
        };

        const waitForClients = () => {
            if (curClients.length === 0) {
                if(!clientWait) {
                    console.log("No clients connected. Waiting...");
                    clientWait = true;
                }

                setTimeout(waitForClients, 500); // Check every half
            } else {
                if(clientWait) {
                    console.log("Clients connected. Resuming streaming.");
                    clientWait = false;
                }
                streamChunk();
            }
        };

        waitForClients();
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

async function downloadMp3FromUrl(url){
    const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}.mp3`);

    // Download the file using axios
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempFilePath);

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    return tempFilePath;
};

module.exports = {
    initialize,
    startStreaming,
    updateClientList
};
