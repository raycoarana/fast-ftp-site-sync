console.log('Test JavaScript file loaded');

function updateTimestamp() {
    const now = new Date();
    const timestampEl = document.querySelector('[data-timestamp]');
    if (timestampEl) {
        timestampEl.textContent = now.toISOString();
    }
}

document.addEventListener('DOMContentLoaded', updateTimestamp);
