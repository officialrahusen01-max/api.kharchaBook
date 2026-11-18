const formatterCache = new Map();

export const isValidTimeZone = (timeZone) => {
    if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 100) {
        return false;
    }

    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    } catch (error) {
        if (error instanceof RangeError) return false;
        throw error;
    }
};

const getFormatter = (timeZone) => {
    if (!formatterCache.has(timeZone)) {
        formatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }));
    }
    return formatterCache.get(timeZone);
};

const getLocalParts = (date, timeZone) => {
    const parts = getFormatter(timeZone).formatToParts(date);
    return Object.fromEntries(parts
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]));
};

export const localDateTimeToUtc = (dateParts, timeZone) => {
    if (!isValidTimeZone(timeZone)) {
        throw new RangeError('Invalid IANA time zone.');
    }

    const targetTime = Date.UTC(
        dateParts.year,
        dateParts.month - 1,
        dateParts.day,
        dateParts.hour ?? 0,
        dateParts.minute ?? 0,
        dateParts.second ?? 0,
    );
    let timestamp = targetTime;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const local = getLocalParts(new Date(timestamp), timeZone);
        const representedTime = Date.UTC(
            local.year,
            local.month - 1,
            local.day,
            local.hour,
            local.minute,
            local.second,
        );
        const adjustment = targetTime - representedTime;
        timestamp += adjustment;
        if (adjustment === 0) break;
    }

    return new Date(timestamp);
};

export const getLoanReminderDate = (dueDate, timeZone) => {
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.valueOf())) {
        throw new TypeError('A valid loan due date is required.');
    }

    const year = dueDate.getUTCFullYear();
    const month = dueDate.getUTCMonth();
    const day = dueDate.getUTCDate() - 1;
    const reminderDay = new Date(Date.UTC(year, month, day));
    return localDateTimeToUtc({
        year: reminderDay.getUTCFullYear(),
        month: reminderDay.getUTCMonth() + 1,
        day: reminderDay.getUTCDate(),
        hour: 9,
    }, timeZone);
};
