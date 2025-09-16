exports.logInfo = async function logInfo(message) {
    try {
        await db.query(
            'INSERT INTO Logs (level, message, timestamp) VALUES ($1, $2, CURRENT_TIMESTAMP)',
            ['INFO', message]
        );
    } catch (error) {
        console.error('Error logging info:', error);
    }
}