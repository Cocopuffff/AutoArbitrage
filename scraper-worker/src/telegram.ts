/**
 * Sends a Telegram alert and returns the Telegram message_id on success, or null on failure.
 */
export async function sendTelegramAlert(message: string): Promise<string | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn('[Telegram] Bot token or chat ID is missing. Skipping alert.');
        return null;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Telegram] Failed to send alert:', errText);
            return null;
        }

        const data = await response.json();
        return String(data.result?.message_id ?? '');
    } catch (error) {
        console.error('[Telegram] Error sending alert:', error);
        return null;
    }
}
