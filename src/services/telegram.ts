export async function sendTelegramAlert(message: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.warn("Telegram bot token or chat ID is missing. Skipping alert.");
        return false;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "Markdown",
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Failed to send Telegram alert:", errText);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error sending Telegram alert:", error);
        return false;
    }
}
