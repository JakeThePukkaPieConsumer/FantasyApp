function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let result = '';
    if (days) result += `${days}d`;
    if (hours) result += `${hours}h`;
    if (minutes) result += `${minutes}m`;
    result += `${secs}s`;

    return result.trim();
}

module.exports = { formatUptime };