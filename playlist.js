require('dotenv').config();
const axios = require('axios');

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const allSongs = [];
const rowsPerPage = 20;

async function FetchSongs(startRow = 1) {
    const endRow = startRow + rowsPerPage - 1;
    const range = `Sheet1!A${startRow}:C${endRow}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

    try {
        const response = await axios.get(url);
        const rows = response.data.values;

        if (rows && rows.length) {
            const songData = rows.map(row => ({
                name: row[0] || '',
                artist: row[1] || '',
                url: row[2] || '',
            }));
            allSongs.push(...songData);

            if (rows.length < rowsPerPage) {
                console.log('All songs fetched:', allSongs.length);
            } else {
                await FetchSongs(startRow + rowsPerPage);
            }
        } else {
            console.log('No more data found.');
            console.log('All songs fetched:', allSongs.length);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function GetRandomSong() {
    if (allSongs.length === 0) {
        console.log('No songs available.');
        return null;
    }

    let randomIndex;
    let randomSong;

    // Find a song that hasn't been returned recently
    do {
        randomIndex = Math.floor(Math.random() * allSongs.length);
        randomSong = allSongs[randomIndex];
    } while (lastSongs.includes(randomSong) && allSongs.length > 12);

    // Update the lastSongs list to include this song
    lastSongs.push(randomSong);

    // Ensure lastSongs doesn't exceed 12 entries
    if (lastSongs.length > 12) {
        lastSongs.shift(); // Remove the oldest song from the list
    }

    return randomSong;
}

module.exports = {
    FetchSongs,
    GetRandomSong
};